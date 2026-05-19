from __future__ import annotations

import unittest

from backend.app.project_store import _normalize_project_sources
from backend.app.workbook_loader import load_default_project


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


if __name__ == "__main__":
    unittest.main()
