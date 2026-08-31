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
from backend.app.receiver_capacity import (
    BEARING_EVIDENCE_KIND,
    KIND,
    calculate_reshore_member_capacity,
)
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
    INDEPENDENT_END_BEARING_BENCHMARK_PATH = (
        Path(__file__).resolve().parent
        / "fixtures"
        / "reshore_end_bearing_independent_benchmark.json"
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

    @staticmethod
    def independent_end_bearing_reference(benchmark: dict) -> dict:
        """Reproduce the fixed end-bearing benchmark without production helpers."""
        value = benchmark["calculationInput"]
        section = benchmark["section"]
        total_demand = (
            float(benchmark["sourceDemandTf"])
            * float(value["imbalance_factor"])
            / int(value["member_count"])
            + float(value["additional_axial_load_tf_per_member"])
        )

        def evaluate_end(prefix: str) -> dict[str, float]:
            width = float(value[f"{prefix}_end_plate_width_cm"])
            length = float(value[f"{prefix}_end_plate_length_cm"])
            thickness = float(value[f"{prefix}_end_plate_thickness_cm"])
            plate_fy = float(value[f"{prefix}_end_plate_fy_tf_per_cm2"])
            support_strength = float(value[f"{prefix}_support_material_strength_tf_per_cm2"])
            support_material = value[f"{prefix}_support_material"]
            area = width * length
            pressure = total_demand / area
            support_allowable = (
                0.90 * min(plate_fy, support_strength)
                if support_material == "finished_steel"
                else 0.35 * support_strength
            )
            width_projection = (width - 0.80 * float(section["flangeWidthCm"])) / 2.0
            length_projection = (length - 0.95 * float(section["depthCm"])) / 2.0
            projection = max(width_projection, length_projection)
            allowable_plate_bending = 0.60 * plate_fy
            required_thickness = projection * math.sqrt(
                3.0 * pressure / allowable_plate_bending
            )
            plate_utilization = (
                3.0 * pressure * projection**2
                / (allowable_plate_bending * thickness**2)
            )
            h_end_allowable = 0.90 * min(
                float(value["fy_tf_per_cm2"]),
                plate_fy,
            )
            h_end_utilization = (
                total_demand / float(section["areaCm2"]) / h_end_allowable
            )
            support_capacity = support_allowable * area
            plate_capacity = (
                allowable_plate_bending * thickness**2 / (3.0 * projection**2) * area
            )
            h_end_capacity = h_end_allowable * float(section["areaCm2"])
            return {
                "contactPressureTfPerCm2": pressure,
                "supportAllowableBearingTfPerCm2": support_allowable,
                "supportBearingUtilizationRatio": pressure / support_allowable,
                "governingProjectionCm": projection,
                "allowablePlateBendingStressTfPerCm2": allowable_plate_bending,
                "requiredPlateThicknessCm": required_thickness,
                "plateBendingUtilizationRatio": plate_utilization,
                "hSectionEndBearingUtilizationRatio": h_end_utilization,
                "governingCapacityPerMemberTf": min(
                    support_capacity,
                    plate_capacity,
                    h_end_capacity,
                ),
            }

        top = evaluate_end("top")
        bottom = evaluate_end("bottom")
        end_capacity = (
            min(
                top["governingCapacityPerMemberTf"],
                bottom["governingCapacityPerMemberTf"],
            )
            - float(value["additional_axial_load_tf_per_member"])
        ) * int(value["member_count"]) / float(value["imbalance_factor"])
        return {
            "totalDemandPerMemberTf": total_demand,
            "top": top,
            "bottom": bottom,
            "endBearingTransferCapacityTf": end_capacity,
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

    @staticmethod
    def valid_end_bearing_overrides() -> dict:
        return {
            "end_bearing_mode": "centered_rectangular_plate",
            "top_end_plate_fy_tf_per_cm2": 2.5,
            "top_end_plate_width_cm": 45.0,
            "top_end_plate_length_cm": 45.0,
            "top_end_plate_thickness_cm": 3.0,
            "top_support_material": "concrete_full_area",
            "top_support_material_strength_tf_per_cm2": 0.28,
            "top_support_true_plane_confirmed": False,
            "bottom_end_plate_width_cm": 50.0,
            "bottom_end_plate_length_cm": 50.0,
            "bottom_end_plate_thickness_cm": 3.5,
            "bottom_end_plate_fy_tf_per_cm2": 2.5,
            "bottom_support_material": "finished_steel",
            "bottom_support_material_strength_tf_per_cm2": 2.5,
            "bottom_support_true_plane_confirmed": True,
            "end_bearing_configuration_basis": "端板配置與密貼依施工詳圖 EB-01。",
            "end_plate_bending_method_basis": "專案指定採均佈反力懸臂板模型及 Fb=0.60Fy。",
            "top_support_bearing_basis": "混凝土試驗報告 FC-01，f'c=0.28 tf/cm²；全面積承壓。",
            "bottom_support_bearing_basis": "加工鋼支承詳圖 SB-01，Fy=2.5 tf/cm²。",
            "centered_full_contact_end_bearing_confirmed": True,
            "h_section_end_finished_confirmed": True,
            "unperforated_unstiffened_single_plate_confirmed": True,
        }

    @classmethod
    def high_capacity_end_bearing_overrides(cls) -> dict:
        return {
            **cls.valid_end_bearing_overrides(),
            "top_end_plate_fy_tf_per_cm2": 10.0,
            "top_end_plate_width_cm": 35.0,
            "top_end_plate_length_cm": 35.0,
            "top_end_plate_thickness_cm": 20.0,
            "top_support_material": "finished_steel",
            "top_support_material_strength_tf_per_cm2": 10.0,
            "top_support_true_plane_confirmed": True,
            "top_support_bearing_basis": "加工鋼支承測試基準，Fy=10.0 tf/cm²。",
            "bottom_end_plate_fy_tf_per_cm2": 10.0,
            "bottom_end_plate_width_cm": 35.0,
            "bottom_end_plate_length_cm": 35.0,
            "bottom_end_plate_thickness_cm": 20.0,
            "bottom_support_material": "finished_steel",
            "bottom_support_material_strength_tf_per_cm2": 10.0,
            "bottom_support_true_plane_confirmed": True,
            "bottom_support_bearing_basis": "加工鋼支承測試基準，Fy=10.0 tf/cm²。",
        }

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
        self.assertNotIn("bearingEvidence", result)
        self.assertEqual(values["checks"]["topEndBearing"], "not_checked")

    def test_independent_end_bearing_benchmark_and_distinct_evidence(self) -> None:
        benchmark = json.loads(
            self.INDEPENDENT_END_BEARING_BENCHMARK_PATH.read_text(encoding="utf-8")
        )
        overrides = {
            **self.valid_end_bearing_overrides(),
            **benchmark["calculationInput"],
        }
        result = self.calculate(**overrides)
        calculation = result["calculation"]
        values = calculation["results"]
        expected = benchmark["expected"]
        independent = self.independent_end_bearing_reference(benchmark)
        tolerance = float(expected["absoluteTolerance"])

        self.assertEqual(benchmark["kind"], "independent-engineering-benchmark")
        self.assertIn("不呼叫 receiver_capacity.py", benchmark["independenceBoundary"])
        self.assertEqual(calculation["schemaVersion"], 4)
        self.assertEqual(calculation["source"]["receiverTransferDemandTf"], benchmark["sourceDemandTf"])
        self.assertAlmostEqual(
            independent["totalDemandPerMemberTf"],
            expected["totalDemandPerMemberTf"],
            delta=tolerance,
        )
        self.assertAlmostEqual(values["totalDemandPerMemberTf"], expected["totalDemandPerMemberTf"], delta=tolerance)
        self.assertEqual(values["status"], expected["status"])
        self.assertEqual(values["governingCapacityMode"], expected["governingCapacityMode"])
        self.assertAlmostEqual(
            independent["endBearingTransferCapacityTf"],
            expected["endBearingTransferCapacityTf"],
            delta=tolerance,
        )
        self.assertAlmostEqual(
            values["endBearingTransferCapacityTf"],
            independent["endBearingTransferCapacityTf"],
            delta=tolerance,
        )
        for end_name in ("top", "bottom"):
            observed_end = values["endBearing"][end_name]
            for field, expected_value in expected[end_name].items():
                with self.subTest(end=end_name, field=field):
                    self.assertAlmostEqual(
                        float(independent[end_name][field]),
                        float(expected_value),
                        delta=tolerance,
                    )
                    self.assertAlmostEqual(
                        float(observed_end[field]),
                        float(independent[end_name][field]),
                        delta=tolerance,
                    )
            self.assertEqual(observed_end["status"], "passed")
            self.assertEqual(
                set(observed_end["checks"].values()),
                {"passed"},
            )

        bearing_evidence = result["bearingEvidence"]
        self.assertRegex(bearing_evidence["documentReference"], r"^RSB-[0-9A-F]{20}$")
        self.assertNotEqual(bearing_evidence["fileSha256"], result["evidence"]["fileSha256"])
        bearing_bytes = base64.b64decode(bearing_evidence["contentBase64"], validate=True)
        self.assertEqual(hashlib.sha256(bearing_bytes).hexdigest(), bearing_evidence["fileSha256"])
        bearing_record = json.loads(bearing_bytes)
        self.assertEqual(bearing_record["kind"], BEARING_EVIDENCE_KIND)
        self.assertEqual(
            bearing_record["source"]["reshoreCalculationFingerprint"],
            calculation["calculationFingerprint"],
        )
        self.assertEqual(
            bearing_record["source"]["reshoreCalculationEvidenceFileName"],
            result["evidence"]["fileName"],
        )
        self.assertEqual(
            bearing_record["source"]["reshoreCalculationEvidenceFileSha256"],
            result["evidence"]["fileSha256"],
        )
        rsb_input = bearing_record["input"]
        recomputed_transfer_demand_per_member = (
            float(bearing_record["source"]["receiverTransferDemandTf"])
            * float(rsb_input["imbalanceFactor"])
            / int(rsb_input["memberCount"])
        )
        recomputed_total_demand_per_member = (
            recomputed_transfer_demand_per_member
            + float(rsb_input["additionalAxialLoadTfPerMember"])
        )
        self.assertAlmostEqual(
            recomputed_transfer_demand_per_member,
            bearing_record["results"]["transferDemandPerMemberTf"],
            delta=tolerance,
        )
        self.assertAlmostEqual(
            recomputed_total_demand_per_member,
            bearing_record["results"]["totalDemandPerMemberTf"],
            delta=tolerance,
        )
        self.assertIn("governingLoadCombination", rsb_input)
        self.assertIn("loadDistributionBasis", rsb_input)
        self.assertIn("hSectionFinishedEndBearing", bearing_record["codeBasis"])
        self.assertEqual(bearing_record["results"]["status"], "passed")
        self.assertTrue(calculation["boundary"]["endBearingChecked"])
        self.assertTrue(calculation["boundary"]["connectionAndBearingNotChecked"])
        self.assertTrue(calculation["boundary"]["connectionNotChecked"])
        self.assertNotIn(
            "頂部與底部承壓及局部補強",
            calculation["verificationScope"]["uncoveredChecks"],
        )

    def test_end_bearing_length_projection_can_control(self) -> None:
        base = self.valid_end_bearing_overrides()
        result = self.calculate(
            **{
                **base,
                "top_end_plate_width_cm": 35.0,
                "top_end_plate_length_cm": 80.0,
                "top_end_plate_thickness_cm": 20.0,
                "top_end_plate_fy_tf_per_cm2": 10.0,
                "top_support_material": "finished_steel",
                "top_support_material_strength_tf_per_cm2": 10.0,
                "top_support_true_plane_confirmed": True,
                "top_support_bearing_basis": "加工鋼支承測試基準，Fy=10.0 tf/cm²。",
            }
        )["calculation"]["results"]["endBearing"]["top"]

        self.assertAlmostEqual(result["widthProjectionCm"], 5.5, places=6)
        self.assertAlmostEqual(result["lengthProjectionCm"], 25.75, places=6)
        self.assertEqual(result["governingProjectionCm"], result["lengthProjectionCm"])
        self.assertGreater(result["lengthProjectionCm"], result["widthProjectionCm"])
        self.assertEqual(
            set(result["checks"]),
            {"supportBearing", "endPlateLocalBending", "hSectionFinishedEndBearing"},
        )

    def test_h_section_finished_end_bearing_can_control_and_fail(self) -> None:
        base = self.high_capacity_end_bearing_overrides()
        passing = self.calculate(**base)["calculation"]["results"]["endBearing"]["top"]

        self.assertEqual(passing["checks"]["hSectionFinishedEndBearing"], "passed")
        self.assertEqual(
            passing["governingCapacityPerMemberTf"],
            passing["hSectionEndBearingCapacityPerMemberTf"],
        )
        self.assertLess(
            passing["hSectionEndBearingCapacityPerMemberTf"],
            passing["supportCapacityPerMemberTf"],
        )
        self.assertLess(
            passing["hSectionEndBearingCapacityPerMemberTf"],
            passing["plateBendingCapacityPerMemberTf"],
        )

        failing = self.calculate(**{**base, "fy_tf_per_cm2": 0.5})["calculation"]["results"]
        for end_name in ("top", "bottom"):
            with self.subTest(end=end_name):
                observed = failing["endBearing"][end_name]
                self.assertEqual(observed["checks"]["supportBearing"], "passed")
                self.assertEqual(observed["checks"]["endPlateLocalBending"], "passed")
                self.assertEqual(observed["checks"]["hSectionFinishedEndBearing"], "failed")
                self.assertEqual(
                    observed["governingCapacityPerMemberTf"],
                    observed["hSectionEndBearingCapacityPerMemberTf"],
                )
        self.assertEqual(failing["status"], "failed")

    def test_bearing_enabled_can_still_be_member_controlled(self) -> None:
        result = self.calculate(
            **self.high_capacity_end_bearing_overrides()
        )["calculation"]["results"]

        self.assertEqual(result["governingCapacityMode"], "member")
        self.assertLess(result["nominalTransferCapacityTf"], result["endBearingTransferCapacityTf"])
        self.assertEqual(result["adoptableTransferCapacityTf"], result["nominalTransferCapacityTf"])
        self.assertEqual(result["status"], "passed")

    def test_extremely_small_bearing_values_return_controlled_api_error(self) -> None:
        handoff = self.prepared_handoff()
        transfer_id = handoff["transfers"][0]["transferId"]
        client = TestClient(app)
        base_input = self.valid_input(**self.valid_end_bearing_overrides()).model_dump()

        for field in (
            "top_end_plate_fy_tf_per_cm2",
            "top_support_material_strength_tf_per_cm2",
            "top_end_plate_thickness_cm",
        ):
            with self.subTest(field=field):
                calculation_input = {**base_input, field: 5e-324}
                response = client.post(
                    "/api/removal-transfer/reshore-member-capacity",
                    json={
                        "handoff": handoff,
                        "transfer_id": transfer_id,
                        "calculation_input": calculation_input,
                    },
                )
                self.assertEqual(response.status_code, 400, response.text)
                self.assertIn("0.000001", response.json()["detail"])

    def test_seventh_decimal_plate_thickness_is_quantized_before_calculation(self) -> None:
        base = self.valid_end_bearing_overrides()
        lower = self.calculate(
            **{**base, "top_end_plate_thickness_cm": 2.5410846}
        )
        upper = self.calculate(
            **{**base, "top_end_plate_thickness_cm": 2.5410847}
        )

        for response in (lower, upper):
            calculation = response["calculation"]
            self.assertEqual(calculation["input"]["topEndPlateThicknessCm"], 2.541085)
            self.assertEqual(
                calculation["results"]["endBearing"]["top"]["providedPlateThicknessCm"],
                2.541085,
            )
            self.assertEqual(
                calculation["results"]["endBearing"]["top"]["checks"]["endPlateLocalBending"],
                "passed",
            )

        self.assertEqual(lower["calculation"]["results"]["status"], upper["calculation"]["results"]["status"])
        self.assertEqual(
            lower["calculation"]["calculationFingerprint"],
            upper["calculation"]["calculationFingerprint"],
        )
        self.assertEqual(
            lower["bearingEvidence"]["documentReference"],
            upper["bearingEvidence"]["documentReference"],
        )

    def test_end_bearing_failures_remain_truthful_and_capacity_governing(self) -> None:
        base = self.valid_end_bearing_overrides()
        weak_support = self.calculate(
            **{**base, "top_support_material_strength_tf_per_cm2": 0.01}
        )["calculation"]["results"]
        self.assertEqual(weak_support["endBearing"]["top"]["checks"]["supportBearing"], "failed")
        self.assertEqual(weak_support["status"], "failed")
        self.assertEqual(weak_support["governingCapacityMode"], "end_bearing")
        self.assertGreater(weak_support["capacityUtilizationRatio"], 1.0)

        thin_plate = self.calculate(
            **{**base, "bottom_end_plate_thickness_cm": 1.9}
        )["calculation"]["results"]
        self.assertEqual(
            thin_plate["endBearing"]["bottom"]["checks"]["endPlateLocalBending"],
            "failed",
        )
        self.assertEqual(thin_plate["checks"]["bottomEndBearing"], "failed")
        self.assertEqual(thin_plate["status"], "failed")

    def test_end_bearing_uses_weaker_contact_material(self) -> None:
        base = self.valid_end_bearing_overrides()
        result = self.calculate(
            **{
                **base,
                "bottom_end_plate_fy_tf_per_cm2": 2.0,
                "bottom_support_material_strength_tf_per_cm2": 2.5,
            }
        )["calculation"]["results"]["endBearing"]["bottom"]
        self.assertAlmostEqual(result["supportAllowableBearingTfPerCm2"], 1.8, places=6)
        self.assertAlmostEqual(result["hSectionEndAllowableBearingStressTfPerCm2"], 1.8, places=6)

    def test_end_bearing_rejects_inapplicable_or_untraceable_inputs(self) -> None:
        base = self.valid_end_bearing_overrides()
        with self.assertRaisesRegex(ValueError, "只適用於.*純軸壓"):
            self.calculate(
                **{
                    **base,
                    "analysis_mode": "axial_biaxial_bending",
                    "transfer_eccentricity_x_m": 0.05,
                    "eccentricity_and_moment_basis": "節點偏心 5 cm。",
                    "bending_stability_basis": "Lb=3.0m，Cb=1.0，Cm=1.0。",
                    "pure_axial_no_eccentricity_confirmed": False,
                }
            )
        with self.assertRaisesRegex(ValueError, "提高係數 1.00"):
            self.calculate(
                **{
                    **base,
                    "allowable_stress_increase_factor": 1.25,
                    "stress_increase_basis": "臨時載重組合。",
                }
            )
        with self.assertRaisesRegex(ValueError, "端板局部彎曲工程模型"):
            self.calculate(**{**base, "end_plate_bending_method_basis": ""})
        with self.assertRaisesRegex(ValueError, "真實平面"):
            self.calculate(**{**base, "bottom_support_true_plane_confirmed": False})
        with self.assertRaisesRegex(ValueError, "無孔洞、無加勁"):
            self.calculate(**{**base, "unperforated_unstiffened_single_plate_confirmed": False})
        with self.assertRaisesRegex(ValueError, "端板寬度不得小於"):
            self.calculate(**{**base, "top_end_plate_width_cm": 29.0})

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

        self.assertEqual(combined["schemaVersion"], 4)
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

        bearing_payload = {
            "handoff": handoff,
            "transfer_id": handoff["transfers"][0]["transferId"],
            "calculation_input": self.valid_input(
                **self.valid_end_bearing_overrides()
            ).model_dump(),
        }
        bearing_response = TestClient(app).post(
            "/api/removal-transfer/reshore-member-capacity",
            json=bearing_payload,
        )
        self.assertEqual(bearing_response.status_code, 200, bearing_response.text)
        self.assertEqual(
            json.loads(base64.b64decode(bearing_response.json()["bearingEvidence"]["contentBase64"]))["kind"],
            BEARING_EVIDENCE_KIND,
        )


if __name__ == "__main__":
    unittest.main()
