"""Export every visible XLSX worksheet to an individual PDF with Excel.

This helper is intentionally narrow: it opens the workbook read-only in a new,
hidden Excel process, disables link updates and macros, and records only the
metadata required by the private release evidence gate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pythoncom
import win32com.client


XL_TYPE_PDF = 0
XL_QUALITY_STANDARD = 0
MSO_AUTOMATION_SECURITY_FORCE_DISABLE = 3
XL_SHEET_VISIBLE = -1


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_name(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-.")
    return normalized[:80] or "sheet"


def page_setup_record(sheet) -> dict[str, object]:
    setup = sheet.PageSetup
    return {
        "printArea": str(setup.PrintArea or ""),
        "printTitleRows": str(setup.PrintTitleRows or ""),
        "orientation": int(setup.Orientation),
        "paperSize": int(setup.PaperSize),
        "zoom": setup.Zoom if isinstance(setup.Zoom, (bool, int, float)) else None,
        "fitToPagesWide": int(setup.FitToPagesWide),
        "fitToPagesTall": int(setup.FitToPagesTall),
        "centerHorizontally": bool(setup.CenterHorizontally),
        "centerVertically": bool(setup.CenterVertically),
        "marginsPoints": {
            "left": float(setup.LeftMargin),
            "right": float(setup.RightMargin),
            "top": float(setup.TopMargin),
            "bottom": float(setup.BottomMargin),
            "header": float(setup.HeaderMargin),
            "footer": float(setup.FooterMargin),
        },
    }


def export_workbook(input_path: Path, output_dir: Path) -> dict[str, object]:
    input_path = input_path.resolve(strict=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    if not input_path.is_file() or input_path.suffix.lower() != ".xlsx":
        raise ValueError("input must be an existing .xlsx file")

    pythoncom.CoInitialize()
    excel = None
    workbook = None
    records: list[dict[str, object]] = []
    try:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        excel.ScreenUpdating = False
        excel.EnableEvents = False
        excel.AskToUpdateLinks = False
        excel.AutomationSecurity = MSO_AUTOMATION_SECURITY_FORCE_DISABLE
        workbook = excel.Workbooks.Open(
            str(input_path),
            UpdateLinks=0,
            ReadOnly=True,
            IgnoreReadOnlyRecommended=True,
            AddToMru=False,
        )

        for index in range(1, workbook.Worksheets.Count + 1):
            sheet = workbook.Worksheets(index)
            if int(sheet.Visible) != XL_SHEET_VISIBLE:
                raise RuntimeError(f"worksheet is not visible: {sheet.Name}")
            used = sheet.UsedRange
            pdf_name = f"sheet-{index:02d}-{safe_name(str(sheet.Name))}.pdf"
            pdf_path = (output_dir / pdf_name).resolve()
            sheet.ExportAsFixedFormat(
                Type=XL_TYPE_PDF,
                Filename=str(pdf_path),
                Quality=XL_QUALITY_STANDARD,
                IncludeDocProperties=True,
                IgnorePrintAreas=False,
                OpenAfterPublish=False,
            )
            if not pdf_path.is_file() or pdf_path.stat().st_size <= 1024:
                raise RuntimeError(f"Excel did not create a usable PDF for {sheet.Name}")
            records.append(
                {
                    "index": index,
                    "sheet": str(sheet.Name),
                    "usedRange": str(used.Address),
                    "usedRows": int(used.Rows.Count),
                    "usedColumns": int(used.Columns.Count),
                    "horizontalPageBreakCount": int(sheet.HPageBreaks.Count),
                    "verticalPageBreakCount": int(sheet.VPageBreaks.Count),
                    "artifact": pdf_name,
                    "artifactBytes": pdf_path.stat().st_size,
                    "artifactSha256": sha256_file(pdf_path),
                    "pageSetup": page_setup_record(sheet),
                }
            )
    finally:
        if workbook is not None:
            workbook.Close(SaveChanges=False)
        if excel is not None:
            excel.Quit()
        workbook = None
        excel = None
        pythoncom.CoUninitialize()

    return {
        "schemaVersion": 1,
        "kind": "xlsx-office-print-export.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "renderer": "microsoft-excel-export-as-fixed-format",
        "source": input_path.name,
        "sourceBytes": input_path.stat().st_size,
        "sourceSha256": sha256_file(input_path),
        "sheetCount": len(records),
        "records": records,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--summary", required=True)
    args = parser.parse_args()

    summary = export_workbook(Path(args.input), Path(args.output_dir))
    summary_path = Path(args.summary).resolve()
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # release helper must fail closed with a concise error
        print(f"xlsx print export failed: {error}", file=sys.stderr)
        raise SystemExit(1)
