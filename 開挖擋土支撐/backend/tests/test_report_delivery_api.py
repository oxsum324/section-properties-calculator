from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend.app import main as report_api
from backend.app.calculations import calculate_project
from backend.app.workbook_loader import load_default_project


class ReportDeliveryApiTests(unittest.TestCase):
    def _calculated_project(self):
        project = load_default_project()
        project.calculation_results = calculate_project(project)
        return project

    def test_approved_pdf_response_exposes_single_source_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            report_path = root / "case-api-approved.pdf"
            evidence_path = root / "case-api-approved.canonical-render.evidence.json"
            bundle_path = root / "case-api-approved.formal-source.zip"
            report_path.write_bytes(b"%PDF fixture")
            evidence_path.write_text("{}", encoding="utf-8")
            bundle_path.write_bytes(b"PK fixture")
            project = self._calculated_project()
            with (
                patch.object(report_api.store, "get_project", return_value=project),
                patch.object(report_api.store, "save_report") as save_report,
                patch.object(report_api, "build_report", return_value=report_path),
                patch.object(report_api, "build_pdf_canonical_render_evidence", return_value=evidence_path) as build_evidence,
                patch.object(report_api, "build_pdf_formal_source_bundle", return_value=bundle_path) as build_bundle,
            ):
                response = report_api.generate_report("case-api", concise=True, approved=True)
            build_evidence.assert_called_once_with(report_path)
            build_bundle.assert_called_once_with(report_path, evidence_path)
            save_report.assert_called_once_with("case-api", report_path)
            self.assertEqual(
                response.formal_source_bundle_url,
                "/api/projects/case-api/report/files/case-api-approved.formal-source.zip",
            )
            self.assertEqual(response.canonical_evidence_url, "/api/projects/case-api/report/files/case-api-approved.canonical-render.evidence.json")

    def test_bundle_failure_removes_all_partial_formal_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            report_path = root / "case-api-failed.pdf"
            evidence_path = root / "case-api-failed.canonical-render.evidence.json"
            report_path.write_bytes(b"%PDF fixture")
            evidence_path.write_text("{}", encoding="utf-8")
            project = self._calculated_project()
            with (
                patch.object(report_api.store, "get_project", return_value=project),
                patch.object(report_api.store, "save_report") as save_report,
                patch.object(report_api, "build_report", return_value=report_path),
                patch.object(report_api, "build_pdf_canonical_render_evidence", return_value=evidence_path),
                patch.object(report_api, "build_pdf_formal_source_bundle", side_effect=RuntimeError("injected bundle failure")),
            ):
                with self.assertRaisesRegex(HTTPException, "來源套件建立失敗"):
                    report_api.generate_report("case-api", approved=True)
            self.assertFalse(report_path.exists())
            self.assertFalse(evidence_path.exists())
            self.assertFalse((root / "case-api-failed.formal-source.zip").exists())
            save_report.assert_not_called()

    def test_download_boundary_allows_only_named_formal_source_zip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            bundle_path = root / "case-api-approved.formal-source.zip"
            bundle_path.write_bytes(b"PK fixture")
            with patch.object(report_api, "settings", SimpleNamespace(reports_dir=root)):
                response = report_api.download_generated_artifact("case-api", bundle_path.name)
                self.assertEqual(response.media_type, "application/zip")
                (root / "case-api-other.zip").write_bytes(b"PK other")
                with self.assertRaises(HTTPException) as error:
                    report_api.download_generated_artifact("case-api", "case-api-other.zip")
                self.assertEqual(error.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
