from __future__ import annotations

import unittest

from backend.app.calculations import (
    allowable_axial_stress,
    allowable_fbx,
    allowable_fby,
    calculate_brace,
    calculate_wale,
    calculate_project,
    cc_value,
    classify_beam_section,
    classify_column_section,
)
from backend.app.schemas import BraceRow, WaleRow
from backend.app.workbook_loader import load_default_project, load_reference_data


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


if __name__ == "__main__":
    unittest.main()
