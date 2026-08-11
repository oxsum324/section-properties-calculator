from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.calculations import calculate_project
from backend.app.project_store import ProjectStore, _normalize_project_sources
from backend.app.removal_transfer_handoff import (
    attach_source_evidence_identity_signature,
    build_removal_transfer_handoff,
    build_receiver_verification_receipt,
    build_source_capacity_evidence_verification,
    build_source_evidence_identity_signing_request,
    receiver_verification_receipt_fingerprint,
)
from backend.sign_receiver_request import build_signature_response
from backend.app.reporting import calculation_fingerprint
from backend.app.schemas import AnalysisForceCase
from backend.app.workbook_loader import load_default_project
from backend.tests.handoff_fixtures import make_stage_adoption


class ProjectStoreNormalizationTests(unittest.TestCase):
    def test_explicit_unused_side_is_not_forced_back_to_manual(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.top_analysis_source.mode = "manual"
        project.bottom_analysis_source.mode = "unused"

        normalized = _normalize_project_sources(project)

        self.assertEqual(normalized.top_analysis_source.mode, "manual")
        self.assertEqual(normalized.bottom_analysis_source.mode, "unused")

    def test_legacy_projects_with_support_rows_are_inferred_as_manual(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.top_analysis_source.mode = "unused"
        project.bottom_analysis_source.mode = "unused"
        project.top_analysis_source.import_result.source_name = ""
        project.bottom_analysis_source.import_result.source_name = ""

        normalized = _normalize_project_sources(project)

        self.assertEqual(normalized.top_analysis_source.mode, "manual")
        self.assertEqual(normalized.bottom_analysis_source.mode, "manual")

    def test_save_imported_file_writes_to_project_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = ProjectStore.__new__(ProjectStore)
            store.settings = SimpleNamespace(projects_dir=Path(tmp_dir))

            target = store.save_imported_file("case-001", "top-analysis.lst", b"analysis")

            self.assertEqual(target.read_bytes(), b"analysis")
            self.assertEqual(target.parent, Path(tmp_dir) / "case-001")

    def test_save_report_copies_latest_report_to_project_folder(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            source = Path(tmp_dir) / "generated.docx"
            source.write_bytes(b"report")
            store = ProjectStore.__new__(ProjectStore)
            store.settings = SimpleNamespace(projects_dir=Path(tmp_dir) / "projects")

            target = store.save_report("case-002", source, latest_name="latest-report.docx")

            self.assertEqual(target.read_bytes(), b"report")
            self.assertEqual(target.name, "latest-report.docx")

    def test_stage_transfer_eccentricity_survives_project_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            store = ProjectStore.__new__(ProjectStore)
            store.settings = SimpleNamespace(db_path=root / "projects.sqlite3", projects_dir=root / "projects")
            store._init_db()
            project = store.create_project("階段偏心保存測試")
            column = next(item for item in project.columns if item.variant == "composite_normal")
            column.construction_stage_loads = [make_stage_adoption(
                column.column_id,
                "偏心吊裝",
                40.0,
                distribution_factor=0.4,
                distribution_basis="構台反力分配圖 S-05",
                eccentricity_x_m=0.75,
                eccentricity_y_m=-0.25,
                transfer_basis="施工配置圖 A-03",
            )]

            store.save_project(project)
            reloaded = store.get_project(project.metadata.id or "")
            saved = next(item for item in reloaded.columns if item.column_id == column.column_id).construction_stage_loads[0]

            self.assertTrue(saved.apply_transfer_eccentricity)
            self.assertAlmostEqual(saved.distribution_factor, 0.4)
            self.assertEqual(saved.distribution_basis, "構台反力分配圖 S-05")
            self.assertAlmostEqual(saved.transfer_eccentricity_x_m, 0.75)
            self.assertAlmostEqual(saved.transfer_eccentricity_y_m, -0.25)
            self.assertEqual(saved.transfer_basis, "施工配置圖 A-03")

    def test_analysis_stage_mapping_survives_project_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            store = ProjectStore.__new__(ProjectStore)
            store.settings = SimpleNamespace(db_path=root / "projects.sqlite3", projects_dir=root / "projects")
            store._init_db()
            project = store.create_project("分析階段對應保存測試")
            row = project.top_supports[0]
            row.force_source = "analysis_import"
            row.analysis_stage_cases = [
                AnalysisForceCase(stage_index=1, stage_label="第一階開挖", axial_force_t=row.axial_force_t)
            ]
            row.analysis_install_stage_index = 1
            row.analysis_install_stage_label = "第一道支撐安裝"
            row.analysis_control_stage_index = 1
            row.analysis_control_stage_label = "第一階開挖"
            row.analysis_removal_stage_index = 3
            row.analysis_removal_stage_label = "第一道支撐拆除"
            row.removal_transfer_mode = "floor"
            row.removal_transfer_target = "B2F 樓版 S1 區"
            row.removal_transfer_direction = "沿第一道支撐軸線向東"
            row.removal_transfer_basis = "拆撐順序圖 CS-04"
            row.removal_transfer_confirmed = True
            row.construction_step_label = "第一階開挖完成、第一層支撐作用"
            row.analysis_mapping_basis = "施工順序表 CS-01"
            row.analysis_mapping_confirmed = True

            store.save_project(project)
            reloaded = store.get_project(project.metadata.id or "")
            saved = reloaded.top_supports[0]

            self.assertEqual(saved.force_source, "analysis_import")
            self.assertEqual(saved.analysis_stage_cases[0].stage_label, "第一階開挖")
            self.assertEqual(saved.analysis_install_stage_index, 1)
            self.assertEqual(saved.analysis_install_stage_label, "第一道支撐安裝")
            self.assertEqual(saved.analysis_control_stage_index, 1)
            self.assertEqual(saved.analysis_removal_stage_index, 3)
            self.assertEqual(saved.analysis_removal_stage_label, "第一道支撐拆除")
            self.assertEqual(saved.removal_transfer_mode, "floor")
            self.assertEqual(saved.removal_transfer_target, "B2F 樓版 S1 區")
            self.assertEqual(saved.removal_transfer_direction, "沿第一道支撐軸線向東")
            self.assertEqual(saved.removal_transfer_basis, "拆撐順序圖 CS-04")
            self.assertTrue(saved.removal_transfer_confirmed)
            self.assertEqual(saved.construction_step_label, "第一階開挖完成、第一層支撐作用")
            self.assertEqual(saved.analysis_mapping_basis, "施工順序表 CS-01")
            self.assertTrue(saved.analysis_mapping_confirmed)

    def test_removal_transfer_handoff_and_receipt_history_survive_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            store = ProjectStore.__new__(ProjectStore)
            store.settings = SimpleNamespace(db_path=root / "projects.sqlite3", projects_dir=root / "projects")
            store._init_db()
            project = store.create_project("拆撐回簽保存測試")
            row = project.top_supports[0]
            row.force_source = "analysis_import"
            row.analysis_stage_cases = [
                AnalysisForceCase(stage_index=2, stage_label="第二階開挖", axial_force_t=row.axial_force_t)
            ]
            row.analysis_install_stage_index = 1
            row.analysis_install_stage_label = "第一道支撐安裝"
            row.analysis_control_stage_index = 2
            row.analysis_control_stage_label = "第二階開挖"
            row.analysis_removal_stage_index = 3
            row.analysis_removal_stage_label = "第一道支撐拆除"
            row.removal_transfer_mode = "floor"
            row.removal_transfer_target = "B2F 樓版 S1 區"
            row.removal_transfer_direction = "沿第一道支撐軸線向東"
            row.removal_transfer_basis = "拆撐順序圖 CS-04"
            row.removal_transfer_confirmed = True
            row.construction_step_label = "第二階開挖完成"
            row.analysis_mapping_basis = "施工順序圖 CS-02"
            row.analysis_mapping_confirmed = True
            project.calculation_results = calculate_project(project)
            handoff = build_removal_transfer_handoff(project, calculation_fingerprint(project))
            transfer = handoff["transfers"][0]
            receipt = {
                "schemaVersion": 1,
                "kind": "receiver-capacity-verification-receipt",
                "issuedAt": "2026-08-07T12:00:00Z",
                "handoffFingerprint": handoff["handoffFingerprint"],
                "sourceCalculationFingerprint": handoff["source"]["calculationFingerprint"],
                "verificationAuthority": {
                    "organization": "承接構造設計單位",
                    "verifierName": "王工程師",
                    "verifierRole": "結構設計覆核",
                    "reportReference": "RV-STORE-01",
                },
                "results": [{
                    "transferId": transfer["transferId"],
                    "status": "passed",
                    "receiverTarget": "B2F 樓版 S1 區",
                    "adoptedDemandTf": transfer["sourceDemand"]["memberDesignAxialForceTf"],
                    "capacityUtilizationRatio": 0.8,
                    "verificationBasis": "承接構造分析模型 RV-STORE-01",
                    "conclusion": "容量檢核通過",
                }],
                "summary": {"status": "passed", "passed": 1, "failed": 0},
                "boundary": {
                    "receiverCalculationCompleted": True,
                    "sourceToolDidNotAutoVerify": True,
                    "verifierIdentityRequiresManualReview": True,
                },
            }
            receipt["receiptFingerprint"] = receiver_verification_receipt_fingerprint(receipt)
            demand = transfer["sourceDemand"]["receiverTransferDemandTf"]
            receipt_v3 = build_receiver_verification_receipt(
                handoff,
                receipt["verificationAuthority"],
                [{
                    "transferId": transfer["transferId"],
                    "receiverTarget": "B2F 樓版 S1 區",
                    "adoptedDemandTf": demand,
                    "verifiedCapacityTf": demand / 0.8,
                    "capacityEvidence": {
                        "documentReference": "RV-STORE-03",
                        "revision": "A",
                        "issuedDate": "2026-08-08",
                        "pageReference": "第 12 頁",
                        "fileName": "receiver-capacity.pdf",
                        "fileSha256": "a" * 64,
                    },
                    "verificationScope": {
                        "analysisModelReference": "承接構造正式分析模型 RV-STORE-03",
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
                                "documentReference": "RV-STORE-03",
                                "revision": "A",
                                "issuedDate": "2026-08-08",
                                "pageReference": "第 13 頁",
                                "fileName": "receiver-capacity.pdf",
                                "fileSha256": "a" * 64,
                            },
                        },
                        *[
                            {"checkId": check_id, "status": "not-applicable", "basis": "本測試僅驗證保存往返。"}
                            for check_id in (
                                "bearing",
                                "receiving-structure",
                                "bracing-and-effective-length",
                                "construction-sequence-and-preload",
                            )
                        ],
                    ],
                    "verificationBasis": "承接構造分析模型 RV-STORE-03",
                    "conclusion": "容量檢核通過",
                }],
                issued_at="2026-08-08T11:00:00Z",
            )
            source_verification = build_source_capacity_evidence_verification(
                handoff,
                receipt_v3,
                {
                    "organization": "來源端設計單位",
                    "verifierName": "李工程師",
                    "verifierRole": "設計覆核",
                },
                "逐列比對接收端正式檢核文件",
                [
                    {
                        "transferId": transfer["transferId"],
                        "evidenceKey": evidence_key,
                        "selectedFileName": "receiver-capacity.pdf",
                        "actualSha256": "a" * 64,
                    }
                    for evidence_key in ("capacity", "connection")
                ],
                verified_at="2026-08-08T12:00:00Z",
            )
            source_verification = attach_source_evidence_identity_signature(
                source_verification,
                build_signature_response(
                    build_source_evidence_identity_signing_request(
                        source_verification,
                        signed_at="2026-08-08T12:05:00Z",
                    ),
                    Ed25519PrivateKey.generate(),
                ),
            )
            project.removal_transfer_handoffs = [handoff]
            project.removal_transfer_verification_receipts = [receipt, receipt_v3]
            project.source_capacity_evidence_verifications = [source_verification]

            store.save_project(project)
            reloaded = store.get_project(project.metadata.id or "")

            self.assertEqual(reloaded.removal_transfer_handoffs[0]["handoffFingerprint"], handoff["handoffFingerprint"])
            self.assertEqual(
                reloaded.removal_transfer_verification_receipts[0]["receiptFingerprint"],
                receipt["receiptFingerprint"],
            )
            self.assertEqual(
                reloaded.source_capacity_evidence_verifications[0]["verificationFingerprint"],
                source_verification["verificationFingerprint"],
            )
            self.assertEqual(
                reloaded.source_capacity_evidence_verifications[0]["identitySignature"]["keyId"],
                source_verification["identitySignature"]["keyId"],
            )

    def test_invalid_removal_transfer_history_is_removed_fail_closed(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.removal_transfer_handoffs = [{"handoffFingerprint": "ERH-FORGED"}]
        project.removal_transfer_verification_receipts = [{"receiptFingerprint": "RVR-FORGED"}]
        project.source_capacity_evidence_verifications = [{"verificationFingerprint": "SEV-FORGED"}]

        normalized = _normalize_project_sources(project)

        self.assertEqual(normalized.removal_transfer_handoffs, [])
        self.assertEqual(normalized.removal_transfer_verification_receipts, [])
        self.assertEqual(normalized.source_capacity_evidence_verifications, [])


if __name__ == "__main__":
    unittest.main()
