from __future__ import annotations

import importlib.util
import unittest

from backend.app.config import get_settings
from backend.app.parsers import parse_analysis_file
from backend.app.workbook_loader import load_default_project

if importlib.util.find_spec("fastapi"):
    from backend.app.main import _annotate_import_result, _apply_import_to_side, _merge_analysis_sources
else:
    _annotate_import_result = None
    _apply_import_to_side = None
    _merge_analysis_sources = None


@unittest.skipUnless(importlib.util.find_spec("fastapi"), "fastapi not installed in current test runtime")
class ImportFlowTests(unittest.TestCase):
    def test_apply_import_to_top_side_only_updates_top_rows(self) -> None:
        settings = get_settings()
        path = settings.root_dir / "1120105.o"
        content = path.read_text(encoding="utf-8", errors="ignore")
        parsed = parse_analysis_file(path.name, content)
        _annotate_import_result(parsed)

        project = load_default_project().model_copy(deep=True)
        original_bottom_supports = [row.model_copy(deep=True) for row in project.bottom_supports]

        _apply_import_to_side(project, "top", parsed)

        self.assertEqual(project.top_analysis_source.mode, "import")
        self.assertEqual(project.top_analysis_source.import_result.source_name, path.name)
        self.assertEqual(len(project.top_supports), 3)
        self.assertEqual(len(project.top_braces), 0)
        self.assertEqual(
            [round(row.axial_force_t, 1) for row in project.top_supports],
            [72.3, 99.5, 217.5],
        )
        self.assertEqual(project.top_wales, [])
        self.assertEqual(project.bottom_supports, original_bottom_supports)
        self.assertTrue(any("忽略樓版" in warning for warning in parsed.warnings))
        self.assertTrue(any("拆撐" in warning for warning in parsed.warnings))

    def test_merge_analysis_sources_keeps_both_side_labels(self) -> None:
        settings = get_settings()
        top_path = settings.root_dir / "1141015D6.LST"
        bottom_path = settings.root_dir / "1150317.o"
        top_parsed = parse_analysis_file(top_path.name, top_path.read_text(encoding="utf-8", errors="ignore"))
        bottom_parsed = parse_analysis_file(
            bottom_path.name,
            bottom_path.read_text(encoding="utf-8", errors="ignore"),
        )
        _annotate_import_result(top_parsed)
        _annotate_import_result(bottom_parsed)

        project = load_default_project().model_copy(deep=True)
        _apply_import_to_side(project, "top", top_parsed)
        _apply_import_to_side(project, "bottom", bottom_parsed)

        merged = _merge_analysis_sources(project, "bottom")

        self.assertIn("上層", merged.source_name)
        self.assertIn("下層", merged.source_name)
        self.assertGreater(len(merged.stages), 0)
        self.assertGreater(len(merged.events), 0)
        self.assertGreaterEqual(len(merged.warnings), 2)


if __name__ == "__main__":
    unittest.main()
