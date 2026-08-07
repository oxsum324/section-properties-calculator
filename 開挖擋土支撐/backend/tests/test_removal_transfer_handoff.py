from __future__ import annotations

from copy import deepcopy
import unittest

from backend.app.calculations import calculate_project
from backend.app.removal_transfer_handoff import (
    KIND,
    RECEIPT_KIND,
    build_removal_transfer_handoff,
    validate_removal_transfer_handoff,
)
from backend.app.reporting import calculation_fingerprint
from backend.app.schemas import AnalysisForceCase
from backend.app.workbook_loader import load_default_project


class RemovalTransferHandoffTests(unittest.TestCase):
    def prepared_project(self):
        project = load_default_project().model_copy(deep=True)
        project.metadata.id = "removal-transfer-test"
        project.metadata.name = "拆撐交接測試案"
        project.metadata.project_code = "EX-RT-01"
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
        row.removal_transfer_basis = "拆撐順序圖 CS-04"
        row.removal_transfer_confirmed = True
        row.construction_step_label = "第二階開挖完成"
        row.analysis_mapping_basis = "施工順序圖 CS-02"
        row.analysis_mapping_confirmed = True
        project.calculation_results = calculate_project(project)
        return project

    def test_builds_pending_receiver_verification_handoff(self) -> None:
        project = self.prepared_project()
        fingerprint = calculation_fingerprint(project)

        record = build_removal_transfer_handoff(
            project,
            fingerprint,
            generated_at="2026-08-07T10:00:00Z",
        )

        self.assertEqual(record["kind"], KIND)
        self.assertRegex(record["handoffFingerprint"], r"^ERH-[0-9A-F]{20}$")
        self.assertEqual(record["source"]["calculationFingerprint"], fingerprint)
        self.assertEqual(len(record["transfers"]), 1)
        transfer = record["transfers"][0]
        self.assertRegex(transfer["transferId"], r"^ERT-[0-9A-F]{20}$")
        self.assertEqual(transfer["sourceMember"]["collection"], "top_supports")
        self.assertEqual(transfer["sourceDemand"]["analysisControlAxialForceTf"], 76.0)
        self.assertEqual(transfer["sourceDemand"]["memberDesignAxialForceTf"], 106.0)
        self.assertEqual(transfer["receiver"]["target"], "B2F 樓版 S1 區")
        self.assertEqual(transfer["verification"]["status"], "pending")
        self.assertEqual(transfer["verification"]["acceptedReceiptKind"], RECEIPT_KIND)
        self.assertTrue(record["boundary"]["requiresReceiverVerification"])
        self.assertFalse(record["boundary"]["autoVerified"])

    def test_rejects_tampered_transfer_content(self) -> None:
        project = self.prepared_project()
        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))
        changed = deepcopy(record)
        changed["transfers"][0]["sourceDemand"]["analysisControlAxialForceTf"] += 1

        with self.assertRaisesRegex(ValueError, "交接內容與交接指紋不一致"):
            validate_removal_transfer_handoff(changed)

    def test_outside_scope_handoff_keeps_receiver_identity_pending(self) -> None:
        project = self.prepared_project()
        row = project.top_supports[0]
        row.removal_transfer_mode = "outside_scope"
        row.removal_transfer_target = ""
        row.removal_transfer_basis = "拆撐順序圖 CS-04，承接構造另案檢核"
        project.calculation_results = calculate_project(project)

        record = build_removal_transfer_handoff(project, calculation_fingerprint(project))

        self.assertTrue(record["transfers"][0]["receiver"]["receiverIdentityRequired"])
        self.assertEqual(record["verificationSummary"]["status"], "pending")

    def test_rejects_source_member_that_did_not_pass_calculation(self) -> None:
        project = self.prepared_project()
        row = project.top_supports[0]
        row.axial_force_t = 100000.0
        row.analysis_stage_cases[0].axial_force_t = row.axial_force_t
        project.calculation_results = calculate_project(project)

        with self.assertRaisesRegex(ValueError, "尚未形成可交接的有效檢核結果"):
            build_removal_transfer_handoff(project, calculation_fingerprint(project))

    def test_requires_at_least_one_confirmed_removal_transfer(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_results = calculate_project(project)

        with self.assertRaisesRegex(ValueError, "目前沒有已完成計算"):
            build_removal_transfer_handoff(project, calculation_fingerprint(project))


if __name__ == "__main__":
    unittest.main()
