from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from backend.app.pdf_render_evidence import (
    CANONICAL_RENDER_EVIDENCE_KIND,
    build_pdf_formal_source_bundle,
)


class PdfFormalSourceBundleTests(unittest.TestCase):
    def _pair(self, root: Path, stem: str = "case-approved") -> tuple[Path, Path]:
        pdf_path = root / f"{stem}.pdf"
        pdf_path.write_bytes(b"%PDF-1.7\napproved calculation fixture\n%%EOF\n")
        evidence_path = root / f"{stem}.canonical-render.evidence.json"
        evidence_path.write_text(
            json.dumps(
                {
                    "kind": CANONICAL_RENDER_EVIDENCE_KIND,
                    "artifact": pdf_path.name,
                    "artifactSha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
                    "generatedAt": "2026-08-09T00:00:00+00:00",
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        return pdf_path, evidence_path

    def test_bundle_contains_only_exact_pdf_and_evidence_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path, evidence_path = self._pair(Path(temp_dir))
            bundle_path = build_pdf_formal_source_bundle(pdf_path, evidence_path)
            self.assertEqual(bundle_path.name, "case-approved.formal-source.zip")
            with ZipFile(bundle_path) as archive:
                self.assertEqual(archive.namelist(), [pdf_path.name, evidence_path.name])
                self.assertEqual(archive.read(pdf_path.name), pdf_path.read_bytes())
                self.assertEqual(archive.read(evidence_path.name), evidence_path.read_bytes())
                self.assertTrue(all(item.date_time == (1980, 1, 1, 0, 0, 0) for item in archive.infolist()))

    def test_bundle_rejects_pdf_changed_after_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path, evidence_path = self._pair(Path(temp_dir))
            pdf_path.write_bytes(pdf_path.read_bytes() + b"tampered")
            with self.assertRaisesRegex(ValueError, "PDF SHA-256"):
                build_pdf_formal_source_bundle(pdf_path, evidence_path)

    def test_bundle_rejects_mismatched_evidence_name_or_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            pdf_path, evidence_path = self._pair(root)
            renamed = root / "other.canonical-render.evidence.json"
            evidence_path.rename(renamed)
            with self.assertRaisesRegex(ValueError, "同名配對"):
                build_pdf_formal_source_bundle(pdf_path, renamed)

            pdf_path, evidence_path = self._pair(root, "second")
            payload = json.loads(evidence_path.read_text(encoding="utf-8"))
            payload["artifact"] = "another.pdf"
            evidence_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "PDF 檔名不符"):
                build_pdf_formal_source_bundle(pdf_path, evidence_path)

    def test_bundle_never_overwrites_an_existing_transport_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path, evidence_path = self._pair(Path(temp_dir))
            bundle_path = build_pdf_formal_source_bundle(pdf_path, evidence_path)
            original = bundle_path.read_bytes()
            with self.assertRaises(FileExistsError):
                build_pdf_formal_source_bundle(pdf_path, evidence_path)
            self.assertEqual(bundle_path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
