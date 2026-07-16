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
from backend.app.reporting import build_report, build_word_report
from backend.app.workbook_loader import load_default_project


PAGE_ONLY_REPORT_STATUS_NEEDLES = (
    "產報前檢查",
    "附件適用狀態",
    "優先建議報告閱讀狀態",
    "報告閱讀狀態",
    "可作附件",
    "暫勿作附件",
    "頁面輔助",
    "公司內部整理計算附件",
    "不會寫入計算書",
    "不會寫入計算書或列印 PDF",
)

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


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: release_report_artifacts.py <output-dir>")

    output_dir = Path(sys.argv[1]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    project = load_default_project().model_copy(deep=True)
    project.metadata.id = "release-evidence"
    project.metadata.name = "正式放行擋土支撐範例"
    project.metadata.project_code = "EXCAVATION-RELEASE"
    project.metadata.location = "本地正式放行驗證"
    project.calculation_results = calculate_project(project)

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
            f"docxText={len(docx_text)}, output={output_dir})"
        )
        return 0
    finally:
        if generated_pdf is not None:
            generated_pdf.unlink(missing_ok=True)
        if generated_docx is not None:
            generated_docx.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
