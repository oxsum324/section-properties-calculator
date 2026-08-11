from __future__ import annotations

import base64
from copy import deepcopy
import hashlib
import json
import math
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.calculations import calculate_project
from backend.app.main import app
from backend.app.receiver_capacity import KIND, calculate_reshore_member_capacity
from backend.app.removal_transfer_handoff import build_removal_transfer_handoff
from backend.app.reporting import calculation_fingerprint
from backend.app.schemas import AnalysisForceCase, ReshoreMemberCapacityInput, SectionProperty
from backend.app.workbook_loader import load_default_project


class ReshoreMemberCapacityTests(unittest.TestCase):
    def prepared_handoff(self, *, receiver_mode: str = "reshore"):
        project = load_default_project().model_copy(deep=True)
        project.metadata.id = "reshore-capacity-test"
        project.metadata.name = "回撐軸壓容量測試案"
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
        row.removal_transfer_mode = receiver_mode
        row.removal_transfer_target = "B2F R1 重撐群"
        row.removal_transfer_direction = "沿原支撐軸線傳至 B2F"
        row.removal_transfer_basis = "拆撐順序圖 CS-04"
        row.removal_transfer_confirmed = True
        row.construction_step_label = "第二階開挖完成"
        row.analysis_mapping_basis = "施工順序圖 CS-02"
        row.analysis_mapping_confirmed = True
        project.calculation_results = calculate_project(project)
        return build_removal_transfer_handoff(
            project,
            calculation_fingerprint(project),
            generated_at="2026-08-11T08:00:00Z",
        )

    def valid_input(self, **overrides):
        values = {
            "section_name": "RH300X300X10X15",
            "member_count": 2,
            "unbraced_length_x_m": 3.0,
            "unbraced_length_y_m": 3.0,
            "effective_length_factor_kx": 1.0,
            "effective_length_factor_ky": 1.0,
            "fy_tf_per_cm2": 2.5,
            "e_tf_per_cm2": 2040.0,
            "allowable_stress_increase_factor": 1.0,
            "imbalance_factor": 1.1,
            "additional_axial_load_tf_per_member": 1.0,
            "governing_load_combination": "拆撐階段 LC-RM-01",
            "effective_length_basis": "上下端依施工詳圖視為鉸接，Kx=Ky=1.0",
            "load_distribution_basis": "兩支平均分配並以 1.10 不均勻係數放大",
            "additional_load_basis": "單支自重及預壓附加軸力 1.0 tf",
            "stress_increase_basis": "",
            "pure_axial_no_eccentricity_confirmed": True,
        }
        values.update(overrides)
        return ReshoreMemberCapacityInput(**values)

    def calculate(self, **overrides):
        handoff = self.prepared_handoff()
        return calculate_reshore_member_capacity(
            handoff,
            handoff["transfers"][0]["transferId"],
            self.valid_input(**overrides),
            generated_at="2026-08-11T09:00:00Z",
        )

    def test_golden_short_column_capacity_and_evidence(self) -> None:
        result = self.calculate()
        calculation = result["calculation"]
        values = calculation["results"]

        klr_x = 300.0 / 13.1
        klr_y = 300.0 / 7.56
        klr = max(klr_x, klr_y)
        cc = math.sqrt(2.0 * math.pi**2 * 2040.0 / 2.5)
        ratio = klr / cc
        expected_fa = ((1.0 - ratio**2 / 2.0) * 2.5) / (
            5.0 / 3.0 + 3.0 * ratio / 8.0 - ratio**3 / 8.0
        )

        self.assertEqual(calculation["kind"], KIND)
        self.assertEqual(values["controllingAxis"], "Y")
        self.assertAlmostEqual(values["klrX"], klr_x, places=6)
        self.assertAlmostEqual(values["klrY"], klr_y, places=6)
        self.assertAlmostEqual(values["baseAllowableAxialStressTfPerCm2"], expected_fa, places=6)
        self.assertEqual(values["status"], "passed")
        self.assertGreater(values["adoptableTransferCapacityTf"], 0)
        demand = calculation["source"]["receiverTransferDemandTf"]
        self.assertAlmostEqual(
            values["capacityUtilizationRatio"],
            demand / values["adoptableTransferCapacityTf"],
            places=6,
        )
        self.assertEqual(calculation["verificationScope"]["otherChecksStatus"], "failed")
        self.assertTrue(calculation["boundary"]["doesNotAutoApproveReceiverReceipt"])

        evidence = result["evidence"]
        evidence_bytes = base64.b64decode(evidence["contentBase64"], validate=True)
        self.assertEqual(hashlib.sha256(evidence_bytes).hexdigest(), evidence["fileSha256"])
        self.assertEqual(json.loads(evidence_bytes)["calculationFingerprint"], calculation["calculationFingerprint"])

    def test_long_column_uses_euler_branch_and_fails_slenderness(self) -> None:
        result = self.calculate(
            unbraced_length_x_m=20.0,
            unbraced_length_y_m=20.0,
            effective_length_factor_kx=3.0,
            effective_length_factor_ky=3.0,
        )["calculation"]
        values = result["results"]
        expected_fa = (12.0 / 23.0) * math.pi**2 * 2040.0 / values["klrMax"] ** 2

        self.assertGreater(values["klrMax"], values["cc"])
        self.assertAlmostEqual(values["baseAllowableAxialStressTfPerCm2"], expected_fa, places=6)
        self.assertEqual(values["checks"]["memberSlenderness"], "failed")
        self.assertEqual(values["adoptableTransferCapacityTf"], 0)
        self.assertEqual(values["status"], "failed")

    def test_local_slenderness_failure_is_not_adoptable(self) -> None:
        slender_section = SectionProperty(
            name="RH-TEST",
            depth_cm=60,
            flange_width_cm=60,
            web_thickness_cm=0.5,
            flange_thickness_cm=0.5,
            area_cm2=120,
            unit_weight_kgf_per_m=100,
            ix_cm4=10000,
            iy_cm4=5000,
            rx_cm=10,
            ry_cm=6,
            rt_cm=6,
            sx_cm3=1000,
            sy_cm3=500,
            zx_cm3=1100,
            zy_cm3=550,
        )
        with patch("backend.app.receiver_capacity.find_section", return_value=slender_section):
            result = self.calculate(section_name="RH-TEST")["calculation"]["results"]
        self.assertEqual(result["checks"]["localSlenderness"], "failed")
        self.assertEqual(result["adoptableTransferCapacityTf"], 0)
        self.assertEqual(result["status"], "failed")

    def test_rejects_non_reshore_transfer(self) -> None:
        handoff = self.prepared_handoff(receiver_mode="floor")
        with self.assertRaisesRegex(ValueError, "receiver.mode=reshore"):
            calculate_reshore_member_capacity(
                handoff,
                handoff["transfers"][0]["transferId"],
                self.valid_input(),
            )

    def test_requires_basis_for_stress_increase_and_additional_load(self) -> None:
        with self.assertRaisesRegex(ValueError, "1.25"):
            self.calculate(
                allowable_stress_increase_factor=1.25,
                stress_increase_basis="",
            )
        with self.assertRaisesRegex(ValueError, "另加單支軸力"):
            self.calculate(additional_load_basis="")
        with self.assertRaisesRegex(ValueError, "控制載重組合"):
            self.calculate(governing_load_combination="   ")

    def test_rejects_non_h_section_even_if_reference_data_contains_it(self) -> None:
        non_h_section = SectionProperty(
            name="BOX-TEST",
            depth_cm=30,
            flange_width_cm=30,
            web_thickness_cm=1,
            flange_thickness_cm=1,
            area_cm2=100,
            unit_weight_kgf_per_m=80,
            ix_cm4=10000,
            iy_cm4=8000,
            rx_cm=10,
            ry_cm=8,
            rt_cm=8,
            sx_cm3=600,
            sy_cm3=500,
            zx_cm3=650,
            zy_cm3=550,
        )
        with patch("backend.app.receiver_capacity.find_section", return_value=non_h_section):
            with self.assertRaisesRegex(ValueError, "H 型鋼"):
                self.calculate(section_name="BOX-TEST")

    def test_rejects_tampered_handoff(self) -> None:
        handoff = deepcopy(self.prepared_handoff())
        handoff["transfers"][0]["sourceDemand"]["receiverTransferDemandTf"] += 1
        with self.assertRaisesRegex(ValueError, "交接指紋"):
            calculate_reshore_member_capacity(
                handoff,
                handoff["transfers"][0]["transferId"],
                self.valid_input(),
            )

    def test_api_returns_typed_calculation(self) -> None:
        handoff = self.prepared_handoff()
        payload = {
            "handoff": handoff,
            "transfer_id": handoff["transfers"][0]["transferId"],
            "calculation_input": self.valid_input().model_dump(),
        }
        response = TestClient(app).post("/api/removal-transfer/reshore-member-capacity", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["calculation"]["kind"], KIND)


if __name__ == "__main__":
    unittest.main()
