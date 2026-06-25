from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from backend.app.project_store import ProjectStore, _normalize_project_sources
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


if __name__ == "__main__":
    unittest.main()
