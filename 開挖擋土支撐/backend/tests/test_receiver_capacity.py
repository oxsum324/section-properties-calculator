from __future__ import annotations

import base64
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
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
    INDEPENDENT_BENCHMARK_PATH = (
        Path(__file__).resolve().parent
        / "fixtures"
        / "reshore_biaxial_independent_benchmark.json"
    )
    INDEPENDENT_822_BENCHMARK_PATH = (
        Path(__file__).resolve().parent
        / "fixtures"
        / "reshore_biaxial_independent_benchmark_822.json"
    )

    @staticmethod
    def independent_biaxial_reference(benchmark: dict) -> dict[str, float | str | None]:
        """Reproduce a fixed benchmark without importing production calculation helpers."""
        benchmark_id = str(benchmark["benchmarkId"])
        section = benchmark["section"]
        value = benchmark["calculationInput"]
        demand = float(benchmark["sourceDemandTf"])
        area = float(section["areaCm2"])
        fy = float(value["fy_tf_per_cm2"])
        e_modulus = float(value["e_tf_per_cm2"])
        stress_increase = float(value["allowable_stress_increase_factor"])
        klr_x = (
            float(value["effective_length_factor_kx"])
            * float(value["unbraced_length_x_m"])
            * 100.0
            / float(section["rxCm"])
        )
        klr_y = (
            float(value["effective_length_factor_ky"])
            * float(value["unbraced_length_y_m"])
            * 100.0
            / float(section["ryCm"])
        )
        cc = math.sqrt(2.0 * math.pi**2 * e_modulus / fy)
        axial_ratio = max(klr_x, klr_y) / cc
        allowable_axial = ((1.0 - axial_ratio**2 / 2.0) * fy) / (
            5.0 / 3.0 + 3.0 * axial_ratio / 8.0 - axial_ratio**3 / 8.0
        )

        flange_ratio = float(section["flangeWidthCm"]) / (
            2.0 * float(section["flangeThicknessCm"])
        )
        web_ratio = (
            float(section["depthCm"]) - 2.0 * float(section["flangeThicknessCm"])
        ) / float(section["webThicknessCm"])
        if not 14.0 / math.sqrt(fy) < flange_ratio < 17.0 / math.sqrt(fy):
            raise AssertionError(f"{benchmark_id} 翼板不再屬於結實斷面範圍。")
        if not web_ratio < 68.0 / math.sqrt(fy):
            raise AssertionError(f"{benchmark_id} 腹板不再符合封閉基準範圍。")
        lc_cm = min(
            20.0 * float(section["flangeWidthCm"]) / math.sqrt(fy),
            1400.0
            / (
                (
                    float(section["depthCm"])
                    / (
                        float(section["flangeWidthCm"])
                        * float(section["flangeThicknessCm"])
                    )
                )
                * fy
            ),
        )
        if not float(value["strong_axis_lateral_unbraced_length_m"]) * 100.0 < lc_cm:
            raise AssertionError(f"{benchmark_id} 的 Lb 不再小於 Lc。")
        adjusted_allowable_axial = allowable_axial * stress_increase
        allowable_fbx = 0.66 * fy * stress_increase
        allowable_fby = 0.75 * fy * stress_increase
        fex = (12.0 / 23.0) * math.pi**2 * e_modulus / klr_x**2
        fey = (12.0 / 23.0) * math.pi**2 * e_modulus / klr_y**2

        def effects(total_transfer_demand: float) -> dict[str, float]:
            transfer = (
                total_transfer_demand
                * float(value["imbalance_factor"])
                / int(value["member_count"])
            )
            total_axial = transfer + float(value["additional_axial_load_tf_per_member"])
            axial_stress = total_axial / area
            moment_x = (
                transfer * float(value["transfer_eccentricity_x_m"])
                + float(value["additional_moment_x_tf_m_per_member"])
            )
            moment_y = (
                transfer * float(value["transfer_eccentricity_y_m"])
                + float(value["additional_moment_y_tf_m_per_member"])
            )
            bending_x = moment_x * 100.0 / float(section["sxCm3"])
            bending_y = moment_y * 100.0 / float(section["syCm3"])
            primary = axial_stress / adjusted_allowable_axial
            if primary <= 0.15:
                interaction_821 = None
                interaction_822 = None
                interaction_823 = primary + bending_x / allowable_fbx + bending_y / allowable_fby
                interaction = interaction_823
                governing_equation = "8.2-3"
            else:
                interaction_821 = (
                    primary
                    + float(value["moment_amplification_coefficient_cmx"])
                    * bending_x
                    / ((1.0 - axial_stress / fex) * allowable_fbx)
                    + float(value["moment_amplification_coefficient_cmy"])
                    * bending_y
                    / ((1.0 - axial_stress / fey) * allowable_fby)
                )
                interaction_822 = (
                    axial_stress / (0.6 * fy * stress_increase)
                    + bending_x / allowable_fbx
                    + bending_y / allowable_fby
                )
                interaction_823 = None
                interaction = max(interaction_821, interaction_822)
                governing_equation = "8.2-1" if interaction_821 >= interaction_822 else "8.2-2"
            bending_utilization_x = bending_x / allowable_fbx
            bending_utilization_y = bending_y / allowable_fby
            return {
                "transferDemandPerMemberTf": transfer,
                "totalDemandPerMemberTf": total_axial,
                "axialStressTfPerCm2": axial_stress,
                "momentXTfMPerMember": moment_x,
                "momentYTfMPerMember": moment_y,
                "bendingStressXTfPerCm2": bending_x,
                "bendingStressYTfPerCm2": bending_y,
                "bendingUtilizationX": bending_utilization_x,
                "bendingUtilizationY": bending_utilization_y,
                "dominantBendingAxis": (
                    None
                    if bending_utilization_x == 0.0 and bending_utilization_y == 0.0
                    else "X" if bending_utilization_x >= bending_utilization_y else "Y"
                ),
                "interaction821Ratio": interaction_821,
                "interaction822Ratio": interaction_822,
                "interaction823Ratio": interaction_823,
                "governingInteractionEquation": governing_equation,
                "memberInteractionRatio": interaction,
            }

        current = effects(demand)
        lower = 0.0
        upper = 1000.0
        if not effects(lower)["memberInteractionRatio"] < 1.0:
            raise AssertionError(f"{benchmark_id} 容量根下界不再通過。")
        if not effects(upper)["memberInteractionRatio"] > 1.0:
            raise AssertionError(f"{benchmark_id} 容量根上界不再失敗。")
        for _ in range(200):
            midpoint = (lower + upper) / 2.0
            if effects(midpoint)["memberInteractionRatio"] <= 1.0:
                lower = midpoint
            else:
                upper = midpoint
        capacity = lower
        capacity_effects = effects(capacity)
        return {
            "klrX": klr_x,
            "klrY": klr_y,
            "cc": cc,
            "baseAllowableAxialStressTfPerCm2": allowable_axial,
            "adjustedAllowableAxialStressTfPerCm2": adjusted_allowable_axial,
            "fexTfPerCm2": fex,
            "feyTfPerCm2": fey,
            "adjustedAllowableBendingStressXTfPerCm2": allowable_fbx,
            "adjustedAllowableBendingStressYTfPerCm2": allowable_fby,
            **current,
            "nominalTransferCapacityTf": capacity,
            "adoptableTransferCapacityTf": capacity,
            "capacityInteractionRatio": capacity_effects["memberInteractionRatio"],
            "capacityInteraction821Ratio": capacity_effects["interaction821Ratio"],
            "capacityInteraction822Ratio": capacity_effects["interaction822Ratio"],
            "capacityInteraction823Ratio": capacity_effects["interaction823Ratio"],
            "capacityGoverningInteractionEquation": capacity_effects["governingInteractionEquation"],
            "capacityMomentXTfMPerMember": capacity_effects["momentXTfMPerMember"],
            "capacityMomentYTfMPerMember": capacity_effects["momentYTfMPerMember"],
        }

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

    def test_pure_axial_mode_rejects_bending_effects(self) -> None:
        with self.assertRaisesRegex(ValueError, "不得輸入偏心距或附加彎矩"):
            self.calculate(transfer_eccentricity_x_m=0.05)

    def test_biaxial_mode_requires_effects_and_engineering_basis(self) -> None:
        with self.assertRaisesRegex(ValueError, "至少須輸入一項"):
            self.calculate(
                analysis_mode="axial_biaxial_bending",
                pure_axial_no_eccentricity_confirmed=False,
            )
        with self.assertRaisesRegex(ValueError, "偏心距、彎矩來源"):
            self.calculate(
                analysis_mode="axial_biaxial_bending",
                transfer_eccentricity_x_m=0.05,
                pure_axial_no_eccentricity_confirmed=False,
            )
        with self.assertRaisesRegex(ValueError, "側向未支撐長度"):
            self.calculate(
                analysis_mode="axial_biaxial_bending",
                transfer_eccentricity_x_m=0.05,
                eccentricity_and_moment_basis="拆撐節點偏心 5 cm，依 CS-04 詳圖",
                pure_axial_no_eccentricity_confirmed=False,
            )

    def test_biaxial_interaction_reduces_adoptable_transfer_capacity(self) -> None:
        pure = self.calculate()["calculation"]
        combined = self.calculate(
            analysis_mode="axial_biaxial_bending",
            transfer_eccentricity_x_m=0.05,
            transfer_eccentricity_y_m=0.03,
            additional_moment_x_tf_m_per_member=0.2,
            additional_moment_y_tf_m_per_member=0.1,
            strong_axis_lateral_unbraced_length_m=3.0,
            moment_gradient_coefficient_cb=1.0,
            moment_amplification_coefficient_cmx=0.85,
            moment_amplification_coefficient_cmy=0.85,
            eccentricity_and_moment_basis="偏心依拆撐節點詳圖 CS-04；附加彎矩依 LC-RM-01 分析",
            bending_stability_basis="Lb=3.0 m；端點受束制且段內有橫向作用，Cmx=Cmy=0.85；Cb=1.0",
            pure_axial_no_eccentricity_confirmed=False,
        )["calculation"]
        values = combined["results"]

        self.assertEqual(combined["schemaVersion"], 3)
        self.assertEqual(values["analysisMode"], "axial_biaxial_bending")
        self.assertAlmostEqual(
            values["momentXTfMPerMember"],
            values["transferDemandPerMemberTf"] * 0.05 + 0.2,
            places=6,
        )
        self.assertAlmostEqual(
            values["momentYTfMPerMember"],
            values["transferDemandPerMemberTf"] * 0.03 + 0.1,
            places=6,
        )
        self.assertGreater(values["memberInteractionRatio"], 0)
        self.assertAlmostEqual(values["capacityInteractionRatio"], 1.0, places=5)
        self.assertEqual(values["checks"]["memberInteraction"], "passed")
        self.assertIn("bending", combined["verificationScope"]["checkedLimitStates"])
        self.assertTrue(combined["boundary"]["axialBiaxialBendingInteractionChecked"])
        self.assertFalse(combined["boundary"]["pureAxialNoEccentricityOnly"])
        self.assertLess(
            values["adoptableTransferCapacityTf"],
            pure["results"]["adoptableTransferCapacityTf"],
        )
        self.assertAlmostEqual(
            values["memberInteractionRatio"],
            values["memberTotalUtilizationRatio"],
            places=6,
        )

    def test_independent_biaxial_benchmark_matches_closed_form_reference(self) -> None:
        observed_equations: set[str] = set()
        observed_factors: set[float] = set()
        observed_axes: set[str] = set()
        for benchmark_path in (
            self.INDEPENDENT_BENCHMARK_PATH,
            self.INDEPENDENT_822_BENCHMARK_PATH,
        ):
            benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
            calculation = self.calculate(**benchmark["calculationInput"])["calculation"]
            values = calculation["results"]
            independent = self.independent_biaxial_reference(benchmark)
            tolerance = float(benchmark["expected"]["absoluteTolerance"])

            self.assertEqual(benchmark["kind"], "independent-engineering-benchmark")
            self.assertIn("不呼叫 receiver_capacity.py", benchmark["independenceBoundary"])
            self.assertEqual(
                calculation["source"]["receiverTransferDemandTf"],
                benchmark["sourceDemandTf"],
            )
            self.assertEqual(values["status"], "passed")
            self.assertEqual(values["analysisMode"], "axial_biaxial_bending")
            for field, expected in benchmark["expected"]["results"].items():
                with self.subTest(benchmark=benchmark["benchmarkId"], field=field):
                    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
                        self.assertAlmostEqual(
                            float(independent[field]),
                            float(expected),
                            delta=tolerance,
                        )
                        self.assertAlmostEqual(
                            float(values[field]),
                            float(independent[field]),
                            delta=tolerance,
                        )
                    else:
                        self.assertEqual(independent[field], expected)
                        self.assertEqual(values[field], independent[field])
            observed_equations.add(str(values["governingInteractionEquation"]))
            observed_factors.add(float(benchmark["calculationInput"]["allowable_stress_increase_factor"]))
            observed_axes.add(str(values["dominantBendingAxis"]))

        self.assertEqual(observed_equations, {"8.2-1", "8.2-2"})
        self.assertEqual(observed_factors, {1.0, 1.25})
        self.assertIn("Y", observed_axes)

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
