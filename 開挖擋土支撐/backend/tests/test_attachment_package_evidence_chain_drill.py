from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from zipfile import ZipFile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.calculations import calculate_project
from backend.app.receiver_trust_backup import build_receiver_trust_registry_backup
from backend.app.receiver_trust_store import ReceiverTrustStore
from backend.app.removal_transfer_handoff import (
    attach_receiver_identity_signature,
    attach_source_evidence_identity_signature,
    build_removal_transfer_handoff,
    build_receiver_identity_signing_request,
    build_receiver_verification_receipt,
    build_source_capacity_evidence_verification,
    build_source_evidence_identity_signing_request,
)
from backend.app.pdf_render_evidence import build_pdf_canonical_render_evidence, build_pdf_formal_source_bundle
from backend.app.reporting import build_report, calculation_fingerprint
from backend.app.schemas import AnalysisForceCase
from backend.app.workbook_loader import load_default_project
from backend.sign_receiver_request import build_signature_response
from backend.verify_source_evidence_chain import build_source_evidence_chain_verification_receipt


REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS_DIR = REPO_ROOT / "結構工具箱" / "tools"
PROJECT_NO = "EXC-DRILL-001"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _raw_public_key(private_key: Ed25519PrivateKey) -> bytes:
    return private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )


def _completed_project():
    project = load_default_project().model_copy(deep=True)
    project.metadata.id = "attachment-evidence-chain-drill"
    project.metadata.name = ""
    project.metadata.project_code = PROJECT_NO
    project.metadata.designer = ""
    project.metadata.location = ""
    row = project.top_supports[0]
    row.force_source = "analysis_import"
    row.analysis_stage_cases = [
        AnalysisForceCase(stage_index=2, stage_label="第二階開挖", axial_force_t=row.axial_force_t),
    ]
    row.analysis_install_stage_index = 1
    row.analysis_install_stage_label = "第一道支撐安裝"
    row.analysis_control_stage_index = 2
    row.analysis_control_stage_label = "第二階開挖"
    row.analysis_removal_stage_index = 3
    row.analysis_removal_stage_label = "第一道支撐拆除"
    row.removal_transfer_mode = "floor"
    row.removal_transfer_target = "B2F 樓版 S1 區"
    row.removal_transfer_direction = "沿支撐軸線"
    row.removal_transfer_basis = "匿名化拆撐順序圖 CS-04"
    row.removal_transfer_confirmed = True
    row.construction_step_label = "第二階開挖完成"
    row.analysis_mapping_basis = "匿名化施工順序圖 CS-02"
    row.analysis_mapping_confirmed = True
    project.calculation_results = calculate_project(project)
    return project


class AttachmentPackageEvidenceChainDrillTests(unittest.TestCase):
    def test_real_backend_chain_builds_and_reverifies_a_formal_v3_package(self) -> None:
        project = _completed_project()
        fingerprint = calculation_fingerprint(project)
        handoff = build_removal_transfer_handoff(project, fingerprint)
        transfer = handoff["transfers"][0]
        demand = transfer["sourceDemand"]["receiverTransferDemandTf"]
        receipt = build_receiver_verification_receipt(
            handoff,
            {
                "organization": "匿名化承接構造設計單位",
                "verifierName": "承接端覆核人",
                "verifierRole": "結構設計覆核",
                "reportReference": "ANON-RV-001",
            },
            [{
                "transferId": transfer["transferId"],
                "receiverTarget": transfer["receiver"]["target"],
                "adoptedDemandTf": demand,
                "verifiedCapacityTf": demand / 0.8,
                "capacityEvidence": {
                    "documentReference": "ANON-RV-001",
                    "revision": "A",
                    "issuedDate": "2026-08-08",
                    "pageReference": "第 12 頁",
                    "fileName": "receiver-capacity.pdf",
                    "fileSha256": "a" * 64,
                },
                "verificationBasis": "匿名化承接構造正式分析",
                "conclusion": "容量檢核完成",
            }],
        )
        sev = build_source_capacity_evidence_verification(
            handoff,
            receipt,
            {
                "organization": "匿名化來源端設計單位",
                "verifierName": "來源端覆核人",
                "verifierRole": "設計覆核",
            },
            "逐列比對匿名化接收端正式文件",
            [{
                "transferId": transfer["transferId"],
                "selectedFileName": "receiver-capacity.pdf",
                "actualSha256": "a" * 64,
            }],
        )

        receiver_key = Ed25519PrivateKey.generate()
        source_key = Ed25519PrivateKey.generate()
        receipt = attach_receiver_identity_signature(
            receipt,
            handoff,
            build_signature_response(build_receiver_identity_signing_request(receipt, handoff), receiver_key),
        )
        sev = attach_source_evidence_identity_signature(
            sev,
            build_signature_response(build_source_evidence_identity_signing_request(sev), source_key),
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_dir = root / "anonymous-case-source"
            package_dir = root / "anonymous-case-package"
            source_dir.mkdir()
            trust_store = ReceiverTrustStore(root / "trust-registry.json")
            trust_store.register_key(
                "匿名化承接構造設計單位",
                "RVR 簽章金鑰",
                base64.b64encode(_raw_public_key(receiver_key)).decode("ascii"),
                independent_verification_confirmed=True,
            )
            trust_store.register_key(
                "匿名化來源端設計單位",
                "SEV 簽章金鑰",
                base64.b64encode(_raw_public_key(source_key)).decode("ascii"),
                independent_verification_confirmed=True,
            )
            trust_backup = build_receiver_trust_registry_backup(trust_store)

            handoff_path = source_dir / "handoff.json"
            receipt_path = source_dir / "receipt.json"
            sev_path = source_dir / "sev.json"
            trust_backup_path = source_dir / "trust-backup.json"
            scv_path = source_dir / "scv.json"
            _write_json(handoff_path, handoff)
            _write_json(receipt_path, receipt)
            _write_json(sev_path, sev)
            _write_json(trust_backup_path, trust_backup)

            scv = build_source_evidence_chain_verification_receipt(
                handoff,
                receipt,
                sev,
                source_files={
                    "handoff": {"fileName": handoff_path.name, "fileSha256": _sha256(handoff_path)},
                    "receipt": {"fileName": receipt_path.name, "fileSha256": _sha256(receipt_path)},
                    "sourceEvidenceVerification": {"fileName": sev_path.name, "fileSha256": _sha256(sev_path)},
                    "trustRegistryBackup": {
                        "fileName": trust_backup_path.name,
                        "fileSha256": _sha256(trust_backup_path),
                    },
                },
                trust_registry_backup=trust_backup,
            )
            _write_json(scv_path, scv)

            generated_pdf = build_report(project, concise_mode=True, approved=True)
            generated_pdf_evidence = build_pdf_canonical_render_evidence(generated_pdf)
            generated_source_bundle = build_pdf_formal_source_bundle(generated_pdf, generated_pdf_evidence)
            pdf_report_path = source_dir / generated_pdf.name
            pdf_evidence_path = source_dir / generated_pdf_evidence.name
            try:
                with ZipFile(generated_source_bundle) as archive:
                    self.assertEqual(archive.namelist(), [generated_pdf.name, generated_pdf_evidence.name])
                    self.assertEqual(archive.read(generated_pdf.name), generated_pdf.read_bytes())
                    self.assertEqual(archive.read(generated_pdf_evidence.name), generated_pdf_evidence.read_bytes())

                zip_package_dir = root / "zip-direct-formal-package"
                zip_manager_build = subprocess.run(
                    [
                        "node",
                        str(TOOLS_DIR / "attachment-package-manager-worker.js"),
                        "--action",
                        "build",
                        "--input",
                        str(generated_source_bundle),
                        "--output",
                        str(zip_package_dir),
                        "--project-no",
                        PROJECT_NO,
                    ],
                    cwd=REPO_ROOT,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    check=False,
                )
                self.assertEqual(
                    zip_manager_build.returncode,
                    0,
                    zip_manager_build.stdout + zip_manager_build.stderr,
                )
                zip_manager_payload = json.loads(zip_manager_build.stdout)
                self.assertTrue(zip_manager_payload["built"])
                self.assertEqual(zip_manager_payload["inputKind"], "formal-source-zip")
                self.assertIn("隔離暫存區安全讀取", zip_manager_payload["displayText"])
                self.assertTrue((zip_package_dir / "01_正式附件" / generated_pdf.name).is_file())
                self.assertTrue(
                    (
                        zip_package_dir
                        / "99_內部追溯_勿附入主報告"
                        / "來源資料"
                        / generated_pdf_evidence.name
                    ).is_file()
                )
                shutil.copy2(generated_pdf, pdf_report_path)
                shutil.copy2(generated_pdf_evidence, pdf_evidence_path)
            finally:
                generated_pdf.unlink(missing_ok=True)
                generated_pdf_evidence.unlink(missing_ok=True)
                generated_source_bundle.unlink(missing_ok=True)

            original_pdf_evidence_text = pdf_evidence_path.read_text(encoding="utf-8")
            tampered_pdf_evidence = json.loads(original_pdf_evidence_text)
            tampered_pdf_evidence["pdf"]["visibleText"]["alignment"]["pages"][0]["ocrText"] += " OCR 證據遭改寫"
            _write_json(pdf_evidence_path, tampered_pdf_evidence)
            ocr_tamper_output = root / "ocr-tamper-check.json"
            ocr_tamper_check = subprocess.run(
                [
                    "node",
                    str(TOOLS_DIR / "attachment-package-check.js"),
                    "--input",
                    str(source_dir),
                    "--project-no",
                    PROJECT_NO,
                    "--output",
                    str(ocr_tamper_output),
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            self.assertEqual(ocr_tamper_check.returncode, 1, ocr_tamper_check.stdout + ocr_tamper_check.stderr)
            ocr_tamper_report = json.loads(ocr_tamper_output.read_text(encoding="utf-8"))
            self.assertEqual(ocr_tamper_report["status"], "review")
            pdf_record = next(item for item in ocr_tamper_report["attachments"] if item["file"] == pdf_report_path.name)
            self.assertIn("ocr-alignment-page-1-ocr-sha256", pdf_record["visibilityEvidence"]["reasons"])
            pdf_evidence_path.write_text(original_pdf_evidence_text, encoding="utf-8")

            build = subprocess.run(
                [
                    "node",
                    str(TOOLS_DIR / "attachment-package-build.js"),
                    "--input",
                    str(source_dir),
                    "--output",
                    str(package_dir),
                    "--project-no",
                    PROJECT_NO,
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            self.assertEqual(build.returncode, 0, build.stdout + build.stderr)
            self.assertTrue(package_dir.exists())

            verify = subprocess.run(
                ["node", str(TOOLS_DIR / "attachment-package-verify.js"), "--input", str(package_dir)],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            self.assertEqual(verify.returncode, 0, verify.stdout + verify.stderr)
            self.assertIn("證據鏈複驗 1 / 1 組", verify.stdout)

            formal_pdf = package_dir / "01_正式附件" / pdf_report_path.name
            internal_sources = package_dir / "99_內部追溯_勿附入主報告" / "來源資料"
            self.assertTrue(formal_pdf.exists())
            self.assertFalse((package_dir / "01_正式附件" / pdf_evidence_path.name).exists())
            self.assertTrue((internal_sources / pdf_evidence_path.name).exists())
            self.assertFalse((package_dir / "01_正式附件" / scv_path.name).exists())
            for source_path in (handoff_path, receipt_path, sev_path, trust_backup_path, scv_path):
                self.assertTrue((internal_sources / source_path.name).exists())

            manifest = json.loads(
                (package_dir / "99_內部追溯_勿附入主報告" / "附件包清單.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["projectNo"], PROJECT_NO)
            self.assertEqual(len(manifest["formalAttachments"]), 1)
            self.assertEqual(len(manifest["traceabilitySources"]), 6)

            sev["verificationBasis"] = "內容在 SCV 建立後遭改寫"
            _write_json(sev_path, sev)
            check_output = root / "tamper-check.json"
            tamper_check = subprocess.run(
                [
                    "node",
                    str(TOOLS_DIR / "attachment-package-check.js"),
                    "--input",
                    str(source_dir),
                    "--project-no",
                    PROJECT_NO,
                    "--output",
                    str(check_output),
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            self.assertEqual(tamper_check.returncode, 2, tamper_check.stdout + tamper_check.stderr)
            tamper_report = json.loads(check_output.read_text(encoding="utf-8"))
            self.assertEqual(tamper_report["status"], "blocked")
            self.assertTrue(
                any(issue["code"] == "scv-source-file-hash-mismatch" for issue in tamper_report["issues"])
            )
            self.assertEqual(tamper_report["evidenceChainLinks"], [])


if __name__ == "__main__":
    unittest.main()
