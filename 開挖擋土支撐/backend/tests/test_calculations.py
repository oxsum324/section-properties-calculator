from __future__ import annotations

import math
import unittest

from backend.app.calculations import (
    allowable_axial_stress,
    allowable_fbx,
    allowable_fby,
    calculate_brace,
    calculate_horizontal_support,
    calculate_wale,
    calculate_project,
    cc_value,
    classify_beam_section,
    classify_column_section,
)
from backend.app.schemas import AnalysisForceCase, BraceRow, SupportRow, WaleRow
from backend.app.workbook_loader import load_default_project, load_reference_data
from backend.tests.handoff_fixtures import make_stage_adoption, make_verified_handoff_source


class CalculationTests(unittest.TestCase):
    def test_custom_functions_have_expected_shape(self) -> None:
        ref = load_reference_data()
        params = ref.basic_defaults
        section = ref.sections[0]
        beam_class = classify_beam_section(
            section.depth_cm,
            section.flange_width_cm,
            section.web_thickness_cm,
            section.flange_thickness_cm,
            params.fy_tf_per_cm2,
        )
        self.assertIn(beam_class, {"塑性斷面", "結實斷面", "半結實斷面", "細長肢材斷面"})
        column_class = classify_column_section(
            section.depth_cm,
            section.flange_width_cm,
            section.web_thickness_cm,
            section.flange_thickness_cm,
            params.fy_tf_per_cm2,
            0.8,
        )
        self.assertIn(column_class, {"塑性斷面", "結實斷面", "半結實斷面", "細長肢材斷面"})
        cc = cc_value(params)
        self.assertGreater(cc, 0)
        self.assertGreater(allowable_axial_stress(60, cc, params.e_tf_per_cm2, params.fy_tf_per_cm2), 0)
        self.assertGreater(
            allowable_fbx(
                section.depth_cm,
                section.flange_width_cm,
                section.web_thickness_cm,
                section.flange_thickness_cm,
                section.rt_cm,
                600,
                80,
                1.0,
                params.fy_tf_per_cm2,
                column_class,
            ),
            0,
        )
        self.assertGreater(
            allowable_fby(
                section.flange_width_cm,
                section.flange_thickness_cm,
                params.fy_tf_per_cm2,
                beam_class,
            ),
            0,
        )

    def test_default_project_generates_results(self) -> None:
        project = load_default_project().model_copy(deep=True)
        results = calculate_project(project)
        self.assertGreater(len(results.summary), 0)
        self.assertGreater(len(results.support_checks), 0)
        self.assertGreater(len(results.column_checks), 0)

    def test_disabled_columns_are_excluded_from_results(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = False

        results = calculate_project(project)

        self.assertEqual(len(results.column_checks), 0)
        self.assertFalse(any(item.group == "柱構件" for item in results.summary))

    def test_single_side_support_mode_only_uses_enabled_support_rows(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_options.include_bottom_supports = False

        results = calculate_project(project)

        self.assertTrue(all(check.module_name == "水平支撐" for check in results.support_checks))
        self.assertTrue(all(item.group == "水平支撐" for item in results.summary if item.group.endswith("水平支撐")))
        for column in project.columns:
            self.assertEqual(len(column.support_rows), len(project.top_supports))

    def test_dual_side_mode_keeps_side_prefixes(self) -> None:
        project = load_default_project().model_copy(deep=True)

        results = calculate_project(project)

        support_groups = [item.group for item in results.summary if item.group.endswith("水平支撐")]
        self.assertIn("上層水平支撐", support_groups)
        self.assertIn("下層水平支撐", support_groups)

    def test_optional_modules_can_be_excluded_from_results(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_options.include_top_wales = False
        project.calculation_options.include_bottom_wales = False
        project.calculation_options.include_top_braces = False
        project.calculation_options.include_bottom_braces = False
        project.calculation_options.include_corner_braces = False

        results = calculate_project(project)

        self.assertEqual(len(results.wale_checks), 0)
        self.assertEqual(len(results.brace_checks), 0)
        self.assertEqual(len(results.corner_brace_checks), 0)
        self.assertFalse(any("橫擋" in item.group for item in results.summary))
        self.assertFalse(any("斜撐" in item.group for item in results.summary))
        self.assertFalse(any("角撐" in item.group for item in results.summary))

    def test_column_support_rows_sync_with_project_supports(self) -> None:
        project = load_default_project().model_copy(deep=True)
        expected_support_count = len(project.top_supports) + len(project.bottom_supports)
        for column in project.columns:
            column.support_rows = []

        calculate_project(project)

        for column in project.columns:
            self.assertEqual(len(column.support_rows), expected_support_count)

    def test_wale_ratio_is_clamped_when_wall_strength_exceeds_demand(self) -> None:
        ref = load_reference_data()
        params = ref.basic_defaults.model_copy(deep=True)
        params.wall_type = "連續壁"
        row = WaleRow(
            level_label="1",
            wale_count=1,
            section_name=ref.sections[0].name,
            span_m=2.0,
            support_spacing_m=2.0,
            line_load_tf_per_m=0.1,
        )

        result = calculate_wale(row, params, "上層橫擋")

        self.assertEqual(result.status, "OK")
        self.assertEqual(result.utilization_ratio, 0.0)
        self.assertEqual(result.computed_value, 0.0)
        self.assertEqual(result.controlling_condition, "牆體抵抗已抵銷橫擋淨需求")
        self.assertEqual(result.details["moment_tf_m"], 0.0)
        self.assertEqual(result.details["shear_tf"], 0.0)
        self.assertEqual(result.details["section_depth_cm"], ref.sections[0].depth_cm)

    def test_wale_can_ignore_wall_deduction_when_option_disabled(self) -> None:
        ref = load_reference_data()
        params = ref.basic_defaults.model_copy(deep=True)
        params.wall_type = "連續壁"
        row = WaleRow(
            level_label="1",
            wale_count=1,
            section_name=ref.sections[0].name,
            span_m=2.0,
            support_spacing_m=2.0,
            line_load_tf_per_m=0.1,
        )

        result = calculate_wale(row, params, "上層橫擋", consider_wall_deduction=False)

        self.assertNotEqual(result.controlling_condition, "牆體抵抗已抵銷橫擋淨需求")
        self.assertGreater(result.utilization_ratio or 0.0, 0.0)
        self.assertGreater(result.details["moment_tf_m"], 0.0)
        self.assertGreater(result.details["shear_tf"], 0.0)

    def test_brace_interaction_display_values_match_ratio(self) -> None:
        ref = load_reference_data()
        params = ref.basic_defaults.model_copy(deep=True)
        row = BraceRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            l1_m=5.0,
            l2_m=5.0,
            angle_deg=45.0,
            tributary_line_load_tf_per_m=20.0,
        )

        result = calculate_brace(row, params, "上層斜撐")

        self.assertEqual(result.controlling_condition, "軸力與撓曲交互作用比")
        self.assertEqual(result.allowable_value, 1.0)
        self.assertEqual(result.computed_value, result.utilization_ratio)
        self.assertEqual(result.details["section_depth_cm"], ref.sections[-1].depth_cm)

    def test_imported_support_requires_confirmed_construction_step_mapping(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=80.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[
                AnalysisForceCase(stage_index=1, stage_label="開挖至第一層", axial_force_t=40.0),
                AnalysisForceCase(stage_index=2, stage_label="開挖至第二層", axial_force_t=80.0),
            ],
            analysis_install_stage_index=1,
            analysis_install_stage_label="開挖至第一層",
            analysis_control_stage_index=2,
            analysis_control_stage_label="開挖至第二層",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertEqual(result.status, "NG")
        self.assertEqual(result.controlling_condition, "資料未完整")
        self.assertIn("尚未確認", result.details["message"])

    def test_confirmed_imported_support_keeps_control_stage_trace(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=80.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[
                AnalysisForceCase(stage_index=1, stage_label="開挖至第一層", axial_force_t=40.0),
                AnalysisForceCase(stage_index=2, stage_label="開挖至第二層", axial_force_t=80.0),
            ],
            analysis_install_stage_index=1,
            analysis_install_stage_label="開挖至第一層",
            analysis_control_stage_index=2,
            analysis_control_stage_label="開挖至第二層",
            construction_step_label="第二階開挖完成、第二層支撐施作前",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="施工步驟圖 S-02 與分析階段表逐項核對",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertNotEqual(result.controlling_condition, "資料未完整")
        self.assertEqual(result.inputs["控制分析階段"], "#2 開挖至第二層")
        self.assertEqual(result.inputs["施工步驟"], "第二階開挖完成、第二層支撐施作前")
        self.assertIn("#1 開挖至第一層 = 40 tf", result.inputs["分析階段內力"])
        self.assertEqual(len(result.details["analysis_stage_utilization_envelope"]), 2)
        self.assertIn("#1 開挖至第一層: N=40 tf, R=", result.details["analysis_stage_utilization_envelope"][0])
        self.assertEqual(result.details["analysis_utilization_controlling_stage"], "#2 開挖至第二層")
        self.assertEqual(result.utilization_ratio, round(result.details["analysis_utilization_controlling_ratio"], 3))

    def test_imported_support_rejects_tampered_control_force(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=79.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[AnalysisForceCase(stage_index=2, stage_label="控制階段", axial_force_t=80.0)],
            analysis_install_stage_index=1,
            analysis_install_stage_label="支撐安裝",
            analysis_control_stage_index=2,
            analysis_control_stage_label="控制階段",
            construction_step_label="第二階開挖",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="施工步驟表",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertEqual(result.status, "NG")
        self.assertIn("採用內力", result.details["message"])

    def test_confirmed_imported_brace_accepts_rounded_line_load(self) -> None:
        ref = load_reference_data()
        axial_force = 80.0
        length_m = 5.0
        angle_deg = 45.0
        line_load = round(axial_force * math.sin(math.radians(angle_deg)) / length_m, 3)
        row = BraceRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            l1_m=length_m,
            l2_m=length_m,
            angle_deg=angle_deg,
            tributary_line_load_tf_per_m=line_load,
            force_source="analysis_import",
            analysis_stage_cases=[
                AnalysisForceCase(stage_index=2, stage_label="斜撐初始階段", axial_force_t=40.0),
                AnalysisForceCase(stage_index=3, stage_label="斜撐控制階段", axial_force_t=axial_force),
            ],
            analysis_install_stage_index=1,
            analysis_install_stage_label="斜撐安裝",
            analysis_control_stage_index=3,
            analysis_control_stage_label="斜撐控制階段",
            construction_step_label="第三階開挖、斜撐作用",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="分析模型階段 3 對照施工順序表",
        )

        result = calculate_brace(row, ref.basic_defaults, "上層斜撐")

        self.assertNotEqual(result.controlling_condition, "資料未完整")
        self.assertEqual(result.inputs["控制分析階段"], "#3 斜撐控制階段")
        self.assertEqual(len(result.details["analysis_stage_utilization_envelope"]), 2)
        self.assertEqual(result.details["analysis_utilization_controlling_stage"], "#3 斜撐控制階段")

    def test_imported_support_rejects_negative_stage_force(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=80.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[
                AnalysisForceCase(stage_index=1, stage_label="符號錯誤階段", axial_force_t=-10.0),
                AnalysisForceCase(stage_index=2, stage_label="控制階段", axial_force_t=80.0),
            ],
            analysis_install_stage_index=1,
            analysis_install_stage_label="支撐安裝",
            analysis_control_stage_index=2,
            analysis_control_stage_label="控制階段",
            construction_step_label="第二階開挖",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="施工步驟表",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertEqual(result.controlling_condition, "資料未完整")
        self.assertIn("不小於 0", result.details["message"])

    def test_imported_support_rejects_removal_before_control_stage(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=80.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[AnalysisForceCase(stage_index=4, stage_label="控制階段", axial_force_t=80.0)],
            analysis_install_stage_index=2,
            analysis_install_stage_label="支撐安裝",
            analysis_control_stage_index=4,
            analysis_control_stage_label="控制階段",
            analysis_removal_stage_index=3,
            analysis_removal_stage_label="拆撐",
            construction_step_label="第三階開挖",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="施工步驟表",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertEqual(result.controlling_condition, "資料未完整")
        self.assertIn("拆撐階段未晚於", result.details["message"])

    def test_imported_support_requires_explicit_removal_transfer_disposition(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=80.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[AnalysisForceCase(stage_index=2, stage_label="控制階段", axial_force_t=80.0)],
            analysis_install_stage_index=1,
            analysis_install_stage_label="支撐安裝",
            analysis_control_stage_index=2,
            analysis_control_stage_label="控制階段",
            analysis_removal_stage_index=3,
            analysis_removal_stage_label="拆撐",
            construction_step_label="第二階開挖",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="施工步驟表",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertEqual(result.controlling_condition, "資料未完整")
        self.assertIn("尚未指定拆撐後荷重處置", result.details["message"])

    def test_imported_support_accepts_explicit_outside_scope_removal_disposition(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=80.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[AnalysisForceCase(stage_index=2, stage_label="控制階段", axial_force_t=80.0)],
            analysis_install_stage_index=1,
            analysis_install_stage_label="支撐安裝",
            analysis_control_stage_index=2,
            analysis_control_stage_label="控制階段",
            analysis_removal_stage_index=3,
            analysis_removal_stage_label="拆撐",
            removal_transfer_mode="outside_scope",
            removal_transfer_basis="拆撐順序圖 CS-04，承接構造另案檢核",
            removal_transfer_confirmed=True,
            construction_step_label="第二階開挖",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="施工步驟表",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertNotEqual(result.controlling_condition, "資料未完整")
        self.assertEqual(result.inputs["拆撐後荷重處置"], "本構件檢核範圍外（另案檢核）")

    def test_imported_support_requires_named_transfer_target(self) -> None:
        ref = load_reference_data()
        row = SupportRow(
            level_label="1",
            section_name=ref.sections[-1].name,
            axial_force_t=80.0,
            temp_force_t=0.0,
            spacing_m=5.0,
            force_source="analysis_import",
            analysis_stage_cases=[AnalysisForceCase(stage_index=2, stage_label="控制階段", axial_force_t=80.0)],
            analysis_install_stage_index=1,
            analysis_install_stage_label="支撐安裝",
            analysis_control_stage_index=2,
            analysis_control_stage_label="控制階段",
            analysis_removal_stage_index=3,
            analysis_removal_stage_label="拆撐",
            removal_transfer_mode="floor",
            removal_transfer_basis="拆撐順序圖 CS-04",
            removal_transfer_confirmed=True,
            construction_step_label="第二階開挖",
            analysis_mapping_confirmed=True,
            analysis_mapping_basis="施工步驟表",
        )

        result = calculate_horizontal_support(row, ref.basic_defaults, "上層水平支撐")

        self.assertEqual(result.controlling_condition, "資料未完整")
        self.assertIn("必須填寫承接構造", result.details["message"])

    def test_incomplete_optional_rows_return_ng_instead_of_raising(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.calculation_options.include_bottom_supports = False
        project.calculation_options.include_bottom_wales = False
        project.calculation_options.include_bottom_braces = False
        for row in project.top_wales:
            row.section_name = ""
        for row in project.top_braces:
            row.section_name = ""
            row.l1_m = 0
            row.l2_m = 0

        results = calculate_project(project)

        self.assertTrue(results.wale_checks)
        self.assertTrue(all(check.status == "NG" for check in results.wale_checks))
        self.assertTrue(all(check.controlling_condition == "資料未完整" for check in results.wale_checks))
        self.assertTrue(results.brace_checks)
        self.assertTrue(all(check.status == "NG" for check in results.brace_checks))
        self.assertTrue(any(item.group == "橫擋" and item.status == "NG" for item in results.summary))

    def test_incomplete_column_support_sections_return_ng(self) -> None:
        project = load_default_project().model_copy(deep=True)
        project.top_supports[0].section_name = ""

        results = calculate_project(project)

        self.assertTrue(results.column_checks)
        self.assertTrue(all(check.status == "NG" for check in results.column_checks))
        self.assertTrue(all(check.controlling_condition == "資料未完整" for check in results.column_checks))

    def test_column_foundation_breakdown_respects_embedment_length(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns[1:]:
            column.enabled = False
        column = project.columns[0]
        column.embedment_length_cm = 150.0
        column.soil_layers[0].thickness_m = 1.0
        column.soil_layers[1].thickness_m = 1.0

        results = calculate_project(project)
        detail = results.column_checks[0].details

        self.assertAlmostEqual(detail["effective_embedment_m"], 1.5, places=3)
        self.assertLessEqual(detail["effective_embedment_m"], column.embedment_length_cm / 100.0)
        self.assertIn("compression_skin_t", detail)
        self.assertIn("tension_skin_t", detail)
        self.assertIn("compression_ratio", detail)
        self.assertIn("tension_ratio", detail)

    def test_column_foundation_type_and_shape_are_normalized(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns[1:]:
            column.enabled = False
        column = project.columns[0]
        column.foundation_type = "鑽掘樁"
        column.foundation_shape = "矩形"

        results = calculate_project(project)
        detail = results.column_checks[0].details

        self.assertIn("compression_tip_t", detail)
        self.assertGreater(detail["compression_tip_t"], 0.0)

    def test_verified_decking_handoff_load_is_added_to_composite_column(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        baseline = calculate_project(project).column_checks[0]
        column.construction_stage_load_t = 64.32
        column.construction_stage_load_source = make_verified_handoff_source(64.32)

        check = calculate_project(project).column_checks[0]

        self.assertAlmostEqual(check.inputs["Np"], 64.32, places=3)
        self.assertAlmostEqual(check.inputs["N"] - baseline.inputs["N"], 64.32, places=3)
        self.assertEqual(check.inputs["來源計算指紋"], "CF-0123456789ABCDEF")
        self.assertRegex(check.inputs["交接指紋"], r"^CSH-[0-9A-F]{20}$")
        self.assertEqual(check.inputs["來源控制工況"], "Pu1")

    def test_construction_stage_load_fails_closed_without_handoff_source(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        column.construction_stage_load_t = 20.0

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertEqual(check.controlling_condition, "資料未完整")
        self.assertIn("缺少可追溯交接來源", check.details["message"])

    def test_construction_stage_load_fails_closed_when_handoff_record_is_tampered(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        column.construction_stage_load_t = 64.32
        source = make_verified_handoff_source(64.32)
        source.handoff_record["load"]["controlAxialLoadTf"] = 65.0
        column.construction_stage_load_source = source

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("內容與指紋不一致", check.details["message"])

    def test_construction_stage_load_fails_closed_when_adopted_load_differs_from_record(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        column.construction_stage_load_t = 63.0
        column.construction_stage_load_source = make_verified_handoff_source(64.32)

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("控制軸力不一致", check.details["message"])

    def test_construction_stage_load_cannot_be_applied_to_middle_column(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "middle"
        column = next(item for item in project.columns if item.variant == "middle")
        column.construction_stage_load_t = 20.0
        column.construction_stage_load_source = make_verified_handoff_source(20.0)

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("只能套用於共構柱", check.details["message"])

    def test_multiple_construction_stages_are_enveloped_per_composite_column(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        column.construction_stage_load_t = 0.0
        column.construction_stage_load_source = None
        column.construction_stage_loads = [
            make_stage_adoption(column.column_id, "構台初設", 40.0),
            make_stage_adoption(column.column_id, "吊車作業", 80.0),
        ]

        check = calculate_project(project).column_checks[0]
        envelope = check.details["construction_stage_envelope"]
        controls = check.details["construction_stage_controls"]

        self.assertEqual(len(envelope), 3)
        self.assertEqual(check.inputs["施工階段包絡數"], 3)
        self.assertEqual(controls["interaction"]["stage_label"], "吊車作業")
        self.assertEqual(controls["compression"]["stage_label"], "吊車作業")
        self.assertEqual(controls["tension"]["stage_label"], "無施工構台荷重基準案")
        self.assertAlmostEqual(check.inputs["Np"], 80.0, places=3)
        self.assertGreater(envelope[0]["PT"], envelope[-1]["PT"])

    def test_multiple_construction_stages_fail_closed_on_column_mapping_mismatch(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        adoption = make_stage_adoption("COL-WRONG-TARGET", "錯誤柱位", 40.0)
        column.construction_stage_loads = [adoption]

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("柱識別碼與目前共構柱不一致", check.details["message"])

    def test_multiple_construction_stages_fail_closed_on_duplicate_handoff(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        adoption = make_stage_adoption(column.column_id, "第一階段", 40.0)
        duplicate = adoption.model_copy(deep=True)
        duplicate.stage_label = "第二階段"
        column.construction_stage_loads = [adoption, duplicate]

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("重複採用相同覆工板交接檔", check.details["message"])

    def test_shared_stage_reaction_is_distributed_across_columns(self) -> None:
        project = load_default_project().model_copy(deep=True)
        columns = [item for item in project.columns if item.variant in {"composite_normal", "composite_crane"}]
        for column in project.columns:
            column.enabled = column in columns
        columns[0].construction_stage_loads = [make_stage_adoption(
            columns[0].column_id,
            "構台滿載",
            100.0,
            distribution_factor=0.4,
            distribution_basis="構台反力分配圖 S-05",
        )]
        columns[1].construction_stage_loads = [make_stage_adoption(
            columns[1].column_id,
            "構台滿載",
            100.0,
            distribution_factor=0.6,
            distribution_basis="構台反力分配圖 S-05",
        )]

        checks = calculate_project(project).column_checks
        by_label = {check.label: check for check in checks}

        self.assertAlmostEqual(by_label[columns[0].title].inputs["Np"], 40.0, places=3)
        self.assertAlmostEqual(by_label[columns[1].title].inputs["Np"], 60.0, places=3)
        first_stage = by_label[columns[0].title].details["construction_stage_envelope"][1]
        self.assertAlmostEqual(first_stage["source_Np"], 100.0, places=3)
        self.assertAlmostEqual(first_stage["distribution_factor"], 0.4, places=6)
        self.assertEqual(first_stage["distribution_basis"], "構台反力分配圖 S-05")

    def test_shared_stage_reaction_fails_closed_when_total_is_not_100_percent(self) -> None:
        for factors, expected in [((1.0, 1.0), "200.00%"), ((0.4, 0.5), "90.00%")]:
            with self.subTest(factors=factors):
                project = load_default_project().model_copy(deep=True)
                columns = [item for item in project.columns if item.variant in {"composite_normal", "composite_crane"}]
                for column in project.columns:
                    column.enabled = column in columns
                for column, factor in zip(columns, factors):
                    column.construction_stage_loads = [make_stage_adoption(
                        column.column_id,
                        "構台滿載",
                        100.0,
                        distribution_factor=factor,
                        distribution_basis="構台反力分配圖 S-05",
                    )]

                checks = calculate_project(project).column_checks

                self.assertTrue(all(check.status == "NG" for check in checks))
                self.assertTrue(all(expected in check.details["message"] for check in checks))

    def test_shared_stage_reaction_requires_basis_and_matching_stage_label(self) -> None:
        for second_label, second_basis, expected in [
            ("構台滿載", "", "每一柱都必須填寫反力分配依據"),
            ("不同階段", "構台反力分配圖 S-05", "施工階段名稱必須一致"),
        ]:
            with self.subTest(second_label=second_label, second_basis=second_basis):
                project = load_default_project().model_copy(deep=True)
                columns = [item for item in project.columns if item.variant in {"composite_normal", "composite_crane"}]
                for column in project.columns:
                    column.enabled = column in columns
                columns[0].construction_stage_loads = [make_stage_adoption(
                    columns[0].column_id,
                    "構台滿載",
                    100.0,
                    distribution_factor=0.4,
                    distribution_basis="構台反力分配圖 S-05",
                )]
                columns[1].construction_stage_loads = [make_stage_adoption(
                    columns[1].column_id,
                    second_label,
                    100.0,
                    distribution_factor=0.6,
                    distribution_basis=second_basis,
                )]

                checks = calculate_project(project).column_checks

                self.assertTrue(all(check.status == "NG" for check in checks))
                self.assertTrue(all(expected in check.details["message"] for check in checks))

    def test_disabled_column_does_not_complete_active_reaction_distribution(self) -> None:
        project = load_default_project().model_copy(deep=True)
        columns = [item for item in project.columns if item.variant in {"composite_normal", "composite_crane"}]
        for column in project.columns:
            column.enabled = column is columns[0]
        columns[0].construction_stage_loads = [make_stage_adoption(
            columns[0].column_id,
            "構台滿載",
            100.0,
            distribution_factor=0.4,
        )]
        columns[1].construction_stage_loads = [make_stage_adoption(
            columns[1].column_id,
            "構台滿載",
            100.0,
            distribution_factor=0.6,
        )]

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("40.00%", check.details["message"])

    def test_stage_transfer_eccentricity_adds_signed_moments_and_controls_envelope(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_crane"
        column = next(item for item in project.columns if item.variant == "composite_crane")
        column.eccentricity_y_m = 0.0
        eccentric = make_stage_adoption(
            column.column_id,
            "偏心吊裝",
            40.0,
            eccentricity_x_m=2.0,
            eccentricity_y_m=-0.5,
            transfer_basis="施工配置圖 A-03",
        )
        axial_only = make_stage_adoption(column.column_id, "滿載置中", 80.0)
        column.construction_stage_loads = [eccentric, axial_only]

        check = calculate_project(project).column_checks[0]
        envelope = check.details["construction_stage_envelope"]
        eccentric_result = next(item for item in envelope if item["stage_label"] == "偏心吊裝")

        self.assertAlmostEqual(eccentric_result["transfer_mx_tf_m"], 80.0, places=3)
        self.assertAlmostEqual(eccentric_result["transfer_my_tf_m"], -20.0, places=3)
        self.assertEqual(eccentric_result["transfer_basis"], "施工配置圖 A-03")
        self.assertGreater(eccentric_result["fbx_value"], 0.0)
        self.assertGreater(eccentric_result["fby_value"], 0.0)
        self.assertEqual(check.details["construction_stage_controls"]["interaction"]["stage_label"], "偏心吊裝")

    def test_stage_transfer_eccentricity_requires_explicit_basis(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_normal"
        column = next(item for item in project.columns if item.variant == "composite_normal")
        column.construction_stage_loads = [make_stage_adoption(column.column_id, "缺依據", 40.0, eccentricity_x_m=1.0)]

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("必須填寫採用依據", check.details["message"])

    def test_stage_transfer_eccentricity_cannot_hide_without_acceptance(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_normal"
        column = next(item for item in project.columns if item.variant == "composite_normal")
        adoption = make_stage_adoption(column.column_id, "未勾選", 40.0)
        adoption.transfer_eccentricity_x_m = 1.0
        column.construction_stage_loads = [adoption]

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("尚未明確勾選採用", check.details["message"])

    def test_stage_transfer_eccentricity_rejects_nonfinite_value(self) -> None:
        project = load_default_project().model_copy(deep=True)
        for column in project.columns:
            column.enabled = column.variant == "composite_normal"
        column = next(item for item in project.columns if item.variant == "composite_normal")
        adoption = make_stage_adoption(
            column.column_id,
            "非有限偏心",
            40.0,
            eccentricity_x_m=1.0,
            transfer_basis="施工配置圖 A-03",
        )
        adoption.transfer_eccentricity_x_m = math.nan
        column.construction_stage_loads = [adoption]

        check = calculate_project(project).column_checks[0]

        self.assertEqual(check.status, "NG")
        self.assertIn("必須為有限數值", check.details["message"])


if __name__ == "__main__":
    unittest.main()
