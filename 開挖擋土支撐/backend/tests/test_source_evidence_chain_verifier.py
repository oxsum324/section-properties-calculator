from __future__ import annotations

import base64
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

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
from backend.app.reporting import calculation_fingerprint
from backend.app.schemas import AnalysisForceCase
from backend.app.workbook_loader import load_default_project
from backend.sign_receiver_request import build_signature_response
from backend.verify_source_evidence_chain import (
    build_source_evidence_chain_verification_receipt,
    chain_verification_fingerprint,
    validate_source_evidence_chain_verification_receipt,
)


def _prepared_chain(*, receiver_passed: bool = True):
    project = load_default_project().model_copy(deep=True)
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
    row.removal_transfer_basis = "拆撐順序圖 CS-04"
    row.removal_transfer_confirmed = True
    row.construction_step_label = "第二階開挖完成"
    row.analysis_mapping_basis = "施工順序圖 CS-02"
    row.analysis_mapping_confirmed = True
    project.calculation_results = calculate_project(project)
    handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
    transfer = handoff["transfers"][0]
    demand = transfer["sourceDemand"]["receiverTransferDemandTf"]
    capacity = demand / (0.8 if receiver_passed else 1.2)
    receipt = build_receiver_verification_receipt(
        handoff,
        {
            "organization": "承接構造設計單位",
            "verifierName": "王工程師",
            "verifierRole": "結構設計覆核",
            "reportReference": "RV-CHAIN-01",
        },
        [{
            "transferId": transfer["transferId"],
            "receiverTarget": transfer["receiver"]["target"],
            "adoptedDemandTf": demand,
            "verifiedCapacityTf": capacity,
            "capacityEvidence": {
                "documentReference": "RV-CHAIN-01",
                "revision": "A",
                "issuedDate": "2026-08-08",
                "pageReference": "第 12 頁",
                "fileName": "receiver-capacity.pdf",
                "fileSha256": "a" * 64,
            },
            "verificationScope": {
                "analysisModelReference": "承接構造正式分析模型 RV-01",
                "governingLoadCombination": "拆撐階段 LC-RM-01",
                "directionAndDistributionBasis": "依施工順序圖及模型反力分配",
                "eccentricityAndSecondaryEffectBasis": "依節點偏心與二階分析結果",
                "checkedLimitStates": ["axial", "shear", "connection"],
                "otherChecksStatus": "passed",
            },
            "supplementalChecks": [
                {
                    "checkId": "connection",
                    "status": "passed",
                    "basis": "接頭檢核由同一正式文件涵蓋。",
                    "evidence": {
                        "documentReference": "RV-CHAIN-01",
                        "revision": "A",
                        "issuedDate": "2026-08-08",
                        "pageReference": "第 13 頁",
                        "fileName": "receiver-capacity.pdf",
                        "fileSha256": "a" * 64,
                    },
                },
                *[
                    {"checkId": check_id, "status": "not-applicable", "basis": "本測試僅驗證證據鏈機制。"}
                    for check_id in (
                        "bearing",
                        "receiving-structure",
                        "bracing-and-effective-length",
                        "construction-sequence-and-preload",
                    )
                ],
            ],
            "verificationBasis": "承接構造正式分析",
            "conclusion": "容量檢核完成",
        }],
    )
    sev = build_source_capacity_evidence_verification(
        handoff,
        receipt,
        {"organization": "來源端設計單位", "verifierName": "李工程師", "verifierRole": "設計覆核"},
        "逐列比對接收端正式文件",
        [
            {
                "transferId": transfer["transferId"],
                "evidenceKey": evidence_key,
                "selectedFileName": "receiver-capacity.pdf",
                "actualSha256": "a" * 64,
            }
            for evidence_key in ("capacity", "connection")
        ],
    )
    return handoff, receipt, sev


def _source_files():
    return {
        "handoff": {"fileName": "handoff.json", "fileSha256": "1" * 64},
        "receipt": {"fileName": "receipt.json", "fileSha256": "2" * 64},
        "sourceEvidenceVerification": {"fileName": "sev.json", "fileSha256": "3" * 64},
    }


def _raw_public_key(private_key: Ed25519PrivateKey) -> bytes:
    return private_key.public_key().public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw,
    )


class SourceEvidenceChainVerifierTests(unittest.TestCase):
    def test_unsigned_chain_is_valid_but_requires_manual_identity_review(self) -> None:
        handoff, receipt, sev = _prepared_chain()

        result = build_source_evidence_chain_verification_receipt(
            handoff,
            receipt,
            sev,
            source_files=_source_files(),
            verified_at="2026-08-08T15:00:00Z",
        )

        self.assertRegex(result["verificationFingerprint"], r"^SCV-[0-9A-F]{20}$")
        self.assertEqual(result["summary"]["chainStatus"], "valid")
        self.assertEqual(result["summary"]["engineeringStatus"], "passed")
        self.assertEqual(result["summary"]["adoptionStatus"], "manual-identity-review-required")
        self.assertFalse(result["trustRegistry"]["provided"])

    def test_signed_chain_with_valid_public_backup_is_eligible(self) -> None:
        handoff, receipt, sev = _prepared_chain()
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
            store = ReceiverTrustStore(Path(temp_dir) / "trust.json")
            store.register_key(
                "承接構造設計單位",
                "RVR 簽章金鑰",
                base64.b64encode(_raw_public_key(receiver_key)).decode("ascii"),
                independent_verification_confirmed=True,
            )
            store.register_key(
                "來源端設計單位",
                "SEV 簽章金鑰",
                base64.b64encode(_raw_public_key(source_key)).decode("ascii"),
                independent_verification_confirmed=True,
            )
            backup = build_receiver_trust_registry_backup(store, exported_at="2026-08-08T12:00:00Z")

        source_files = _source_files()
        source_files["trustRegistryBackup"] = {"fileName": "trust-backup.json", "fileSha256": "4" * 64}
        result = build_source_evidence_chain_verification_receipt(
            handoff,
            receipt,
            sev,
            source_files=source_files,
            trust_registry_backup=backup,
        )

        self.assertEqual(result["summary"]["adoptionStatus"], "eligible-trusted-identities")
        self.assertTrue(result["rvrIdentityVerification"]["trusted"])
        self.assertTrue(result["sevIdentityVerification"]["trusted"])
        self.assertEqual(result["trustRegistry"]["backupFingerprint"], backup["backupFingerprint"])

    def test_failed_receiver_engineering_result_is_not_eligible(self) -> None:
        handoff, receipt, sev = _prepared_chain(receiver_passed=False)

        result = build_source_evidence_chain_verification_receipt(
            handoff,
            receipt,
            sev,
            source_files=_source_files(),
        )

        self.assertEqual(result["summary"]["engineeringStatus"], "failed")
        self.assertEqual(result["summary"]["adoptionStatus"], "not-eligible-engineering-failed")

    def test_tampered_chain_receipt_is_rejected(self) -> None:
        handoff, receipt, sev = _prepared_chain()
        result = build_source_evidence_chain_verification_receipt(
            handoff,
            receipt,
            sev,
            source_files=_source_files(),
        )
        tampered = deepcopy(result)
        tampered["summary"]["adoptionStatus"] = "eligible-trusted-identities"
        tampered["verificationFingerprint"] = chain_verification_fingerprint(tampered)

        with self.assertRaisesRegex(ValueError, "採用狀態與工程／身分結果不一致"):
            validate_source_evidence_chain_verification_receipt(tampered)

    def test_tampered_trust_registry_summary_is_rejected(self) -> None:
        handoff, receipt, sev = _prepared_chain()
        result = build_source_evidence_chain_verification_receipt(
            handoff,
            receipt,
            sev,
            source_files=_source_files(),
        )
        tampered = deepcopy(result)
        tampered["trustRegistry"]["provided"] = True
        tampered["verificationFingerprint"] = chain_verification_fingerprint(tampered)

        with self.assertRaisesRegex(ValueError, "信任清冊指紋不正確"):
            validate_source_evidence_chain_verification_receipt(tampered)

    def test_source_file_summary_rejects_path_disclosure(self) -> None:
        handoff, receipt, sev = _prepared_chain()
        source_files = _source_files()
        source_files["handoff"]["fileName"] = "C:\\private\\handoff.json"

        with self.assertRaisesRegex(ValueError, "handoff來源檔案摘要不完整"):
            build_source_evidence_chain_verification_receipt(
                handoff,
                receipt,
                sev,
                source_files=source_files,
            )

    def test_tampered_identity_result_is_rejected(self) -> None:
        handoff, receipt, sev = _prepared_chain()
        result = build_source_evidence_chain_verification_receipt(
            handoff,
            receipt,
            sev,
            source_files=_source_files(),
        )
        tampered = deepcopy(result)
        tampered["rvrIdentityVerification"]["trusted"] = True
        tampered["rvrIdentityVerification"]["status"] = "trusted-signature-valid"
        tampered["summary"]["adoptionStatus"] = "manual-identity-review-required"
        tampered["verificationFingerprint"] = chain_verification_fingerprint(tampered)

        with self.assertRaisesRegex(ValueError, "簽章驗證結果不一致"):
            validate_source_evidence_chain_verification_receipt(tampered)

    def test_cli_writes_independent_chain_receipt_without_database(self) -> None:
        handoff, receipt, sev = _prepared_chain()
        project_root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            handoff_path = temp / "handoff.json"
            receipt_path = temp / "receipt.json"
            sev_path = temp / "sev.json"
            output_path = temp / "chain-receipt.json"
            for path, value in ((handoff_path, handoff), (receipt_path, receipt), (sev_path, sev)):
                path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "backend.verify_source_evidence_chain",
                    "--handoff",
                    str(handoff_path),
                    "--receipt",
                    str(receipt_path),
                    "--sev",
                    str(sev_path),
                    "--output",
                    str(output_path),
                ],
                cwd=project_root,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                env={**os.environ, "PYTHONUTF8": "1"},
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("證據鏈驗證完成", completed.stdout)
            written = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(written["summary"]["chainStatus"], "valid")
            self.assertTrue(written["boundary"]["noProjectDatabaseRequired"])
            self.assertTrue(written["boundary"]["requiresSourceFilesForRevalidation"])


if __name__ == "__main__":
    unittest.main()
