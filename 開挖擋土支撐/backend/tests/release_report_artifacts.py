from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

from docx import Document
from pypdf import PdfReader

from backend.app.calculations import calculate_project
from backend.app.project_store import ProjectStore
from backend.app.reporting import build_report, build_word_report, calculation_fingerprint
from backend.app.schemas import ProjectState
from backend.app.workbook_loader import load_default_project


CALCULATION_BOOK_CONTENT_BOUNDARY = json.loads(
    (Path(__file__).resolve().parents[3] / "結構工具箱" / "tools" / "calculation-book-content-boundary.json").read_text(encoding="utf-8")
)
PAGE_ONLY_REPORT_STATUS_NEEDLES = tuple(dict.fromkeys(
    needle
    for category in CALCULATION_BOOK_CONTENT_BOUNDARY["forbiddenCategories"].values()
    for needle in category
))

REQUIRED_REPORT_TEXT = (
    "擋土支撐檢核計算書",
    "正式放行擋土支撐範例",
    "一、摘要",
    "二、設計依據",
    "三、結構分析使用之電腦程式",
    "六、結構計算結果",
    "附件一",
    "附件二",
)


def require(pass_condition: bool, message: str) -> None:
    if not pass_condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


RESULT_GROUPS = (
    "support_checks",
    "wale_checks",
    "brace_checks",
    "corner_brace_checks",
    "column_checks",
)

CHECK_FIELDS = (
    "module_name",
    "label",
    "formula_id",
    "computed_value",
    "allowable_value",
    "utilization_ratio",
    "status",
    "controlling_condition",
)


def canonical_results(project: ProjectState) -> dict:
    require(project.calculation_results is not None, "project must contain calculation results")
    return project.calculation_results.model_dump(mode="json", exclude={"generated_at"})


def canonical_sha256(payload: dict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def verify_replayed_results(expected: dict, actual: dict) -> tuple[int, int, dict[str, int]]:
    assertion_count = 0
    check_count = 0
    group_counts: dict[str, int] = {}
    for group_name in RESULT_GROUPS:
        expected_checks = expected.get(group_name) or []
        actual_checks = actual.get(group_name) or []
        require(len(actual_checks) == len(expected_checks), f"replayed {group_name} check count must match")
        assertion_count += 1
        group_counts[group_name] = len(actual_checks)
        check_count += len(actual_checks)
        for index, (expected_check, actual_check) in enumerate(zip(expected_checks, actual_checks, strict=True)):
            for field in CHECK_FIELDS:
                require(
                    actual_check.get(field) == expected_check.get(field),
                    f"replayed {group_name}[{index}].{field} must match",
                )
                assertion_count += 1

    expected_summary = expected.get("summary") or []
    actual_summary = actual.get("summary") or []
    require(len(actual_summary) == len(expected_summary), "replayed summary count must match")
    assertion_count += 1
    summary_fields = ("group", "label", "section_name", "status", "utilization_ratio")
    for index, (expected_item, actual_item) in enumerate(zip(expected_summary, actual_summary, strict=True)):
        for field in summary_fields:
            require(actual_item.get(field) == expected_item.get(field), f"replayed summary[{index}].{field} must match")
            assertion_count += 1

    require(actual.get("warnings") == expected.get("warnings"), "replayed warnings must match")
    assertion_count += 1
    return check_count, assertion_count, group_counts


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: release_report_artifacts.py <output-dir>")

    output_dir = Path(sys.argv[1]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    source_project = load_default_project().model_copy(deep=True)
    source_project.metadata.id = "release-evidence"
    source_project.metadata.name = "正式放行擋土支撐範例"
    source_project.metadata.project_code = "EXCAVATION-RELEASE"
    source_project.metadata.location = "本地正式放行驗證"
    source_project.calculation_results = None

    source_project_path = output_dir / "excavation-project-state.json"
    source_project_path.write_text(
        json.dumps(source_project.model_dump(mode="json"), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    reloaded_project = ProjectState.model_validate_json(source_project_path.read_text(encoding="utf-8"))
    require(reloaded_project.calculation_results is None, "preserved ProjectState must contain inputs only")

    baseline_project = source_project.model_copy(deep=True)
    baseline_project.calculation_results = calculate_project(baseline_project)
    reloaded_project.calculation_results = calculate_project(reloaded_project)
    expected_results = canonical_results(baseline_project)
    replayed_results = canonical_results(reloaded_project)
    require(replayed_results == expected_results, "ProjectState replay must reproduce the complete result payload")
    verified_check_count, verified_assertion_count, verified_group_counts = verify_replayed_results(
        expected_results,
        replayed_results,
    )
    require(verified_check_count == 47, "release ProjectState replay must verify all 47 component checks")
    project = reloaded_project
    result_sha256 = canonical_sha256(replayed_results)
    fingerprint = calculation_fingerprint(project)
    require(re.fullmatch(r"CF-[0-9A-F]{16}", fingerprint) is not None, "release calculation fingerprint format")

    generated_pdf: Path | None = None
    generated_docx: Path | None = None
    try:
        generated_pdf = build_report(project, concise_mode=False)
        generated_docx = build_word_report(project, concise_mode=False)

        pdf_path = output_dir / "excavation-report.pdf"
        docx_path = output_dir / "excavation-report.docx"
        shutil.copy2(generated_pdf, pdf_path)
        shutil.copy2(generated_docx, docx_path)

        store = ProjectStore.__new__(ProjectStore)
        store.settings = SimpleNamespace(projects_dir=output_dir / "latest-download")
        latest_pdf_path = store.save_report(project.metadata.id, pdf_path)
        latest_docx_path = store.save_report(
            project.metadata.id,
            docx_path,
            latest_name="latest-report.docx",
        )

        reader = PdfReader(str(pdf_path))
        pdf_page_texts = [page.extract_text() or "" for page in reader.pages]
        pdf_text = "\n".join(pdf_page_texts)
        require(len(reader.pages) >= 20, "release PDF must keep at least 20 pages")
        require(len(pdf_text) > 25_000, "release PDF must contain substantial text")
        require(
            all(len(page_text.strip()) > 100 for page_text in pdf_page_texts),
            "release PDF must not contain empty or sparse text pages",
        )

        document = Document(str(docx_path))
        paragraph_text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        table_text = "\n".join(
            cell.text
            for table in document.tables
            for row in table.rows
            for cell in row.cells
        )
        docx_text = paragraph_text + "\n" + table_text
        with ZipFile(docx_path) as archive:
            archive_names = archive.namelist()
            document_xml = archive.read("word/document.xml").decode("utf-8")

        section_heading_count = len(re.findall(r"[一二三四五六七八九十]+、", docx_text))
        document_xml_text = re.sub(r"<[^>]+>", "", document_xml)
        xml_paragraph_count = len(re.findall(r"<w:p(?:\s|>)", document_xml))
        xml_table_count = len(re.findall(r"<w:tbl(?:\s|>)", document_xml))
        xml_section_count = len(re.findall(r"[一二三四五六七八九十]+、", document_xml_text))
        page_break_count = document_xml.count('w:type="page"')
        drawing_count = document_xml.count("<w:drawing")
        media_count = len([name for name in archive_names if name.startswith("word/media/")])
        require(len(docx_text) > 25_000, "release DOCX must contain substantial text")
        require(len(document.paragraphs) >= 500, "release DOCX must keep populated paragraphs")
        require(len(document.tables) >= 10, "release DOCX must keep populated tables")
        require(section_heading_count >= 8, "release DOCX must keep formal section headings")
        require(page_break_count >= 2, "release DOCX must keep appendix page breaks")
        require(drawing_count >= 1, "release DOCX must keep report drawings")
        require(media_count >= 1, "release DOCX must keep embedded media")

        for needle in REQUIRED_REPORT_TEXT:
            require(needle in pdf_text, f"release PDF missing required text: {needle}")
            require(needle in docx_text, f"release DOCX missing required text: {needle}")
        for needle in PAGE_ONLY_REPORT_STATUS_NEEDLES:
            require(needle not in pdf_text, f"release PDF contains page-only text: {needle}")
            require(needle not in docx_text, f"release DOCX contains page-only text: {needle}")
        require(fingerprint in pdf_text, "release PDF must contain the replayed calculation fingerprint")
        require(fingerprint in docx_text, "release DOCX must contain the replayed calculation fingerprint")

        pdf_hash = sha256(pdf_path)
        docx_hash = sha256(docx_path)
        require(sha256(latest_pdf_path) == pdf_hash, "latest PDF must match generated PDF")
        require(sha256(latest_docx_path) == docx_hash, "latest DOCX must match generated DOCX")

        summary = {
            "schemaVersion": 1,
            "family": "excavation-formal",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "required": 1,
            "complete": ["excavation-report"],
            "pass": True,
            "records": [
                {
                    "key": "excavation-report",
                    "artifact": pdf_path.name,
                    "document": docx_path.name,
                    "latestArtifact": latest_pdf_path.relative_to(output_dir).as_posix(),
                    "latestDocument": latest_docx_path.relative_to(output_dir).as_posix(),
                    "latestArtifactBytes": latest_pdf_path.stat().st_size,
                    "latestDocumentBytes": latest_docx_path.stat().st_size,
                    "latestArtifactSha256": sha256(latest_pdf_path),
                    "latestDocumentSha256": sha256(latest_docx_path),
                    "artifactBytes": pdf_path.stat().st_size,
                    "documentBytes": docx_path.stat().st_size,
                    "documentXmlBytes": len(document_xml.encode("utf-8")),
                    "artifactSha256": pdf_hash,
                    "documentSha256": docx_hash,
                    "pdfPageCount": len(reader.pages),
                    "pdfTextLength": len(pdf_text),
                    "documentTextLength": len(docx_text),
                    "paragraphCount": len(document.paragraphs),
                    "tableCount": len(document.tables),
                    "sectionCount": section_heading_count,
                    "documentXmlTextLength": len(document_xml_text),
                    "xmlParagraphCount": xml_paragraph_count,
                    "xmlTableCount": xml_table_count,
                    "xmlSectionCount": xml_section_count,
                    "pageBreakCount": page_break_count,
                    "drawingCount": drawing_count,
                    "mediaCount": media_count,
                    "projectName": project.metadata.name,
                    "resultReconciliation": {
                        "schemaVersion": 1,
                        "strategy": "excavation-project-state-replay-to-pdf-docx-hash",
                        "caseId": project.metadata.id,
                        "sourceProject": source_project_path.name,
                        "sourceProjectSha256": sha256(source_project_path),
                        "resultSha256": result_sha256,
                        "calculationFingerprint": fingerprint,
                        "verifiedCheckCount": verified_check_count,
                        "verifiedAssertionCount": verified_assertion_count,
                        "verifiedGroupCounts": verified_group_counts,
                        "pdfSha256": pdf_hash,
                        "docxSha256": docx_hash,
                        "pass": True,
                    },
                }
            ],
        }
        (output_dir / "rendered-delivery-evidence-summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            "Excavation release artifacts OK "
            f"(pdfPages={len(reader.pages)}, pdfText={len(pdf_text)}, "
            f"docxText={len(docx_text)}, checks={verified_check_count}, "
            f"assertions={verified_assertion_count}, output={output_dir})"
        )
        return 0
    finally:
        if generated_pdf is not None:
            generated_pdf.unlink(missing_ok=True)
        if generated_docx is not None:
            generated_docx.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
