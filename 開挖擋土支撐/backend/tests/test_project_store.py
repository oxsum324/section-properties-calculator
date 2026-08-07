from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from backend.app.project_store import ProjectStore, _normalize_project_sources
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


if __name__ == "__main__":
    unittest.main()
