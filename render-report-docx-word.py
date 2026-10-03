"""Render DOCX in our own late-bound Word instance; keep format alerts enabled."""
import argparse
import hashlib
import json
import time
from pathlib import Path
import pythoncom
import win32com.client.dynamic


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    sources = sorted(args.input_directory.resolve().glob("*.docx"))
    if not sources:
        raise RuntimeError("No DOCX files to render")
    output = args.output_directory.resolve()
    output.mkdir(parents=True, exist_ok=True)
    summary = {"inputRoot": str(args.input_directory.resolve()), "outputRoot": str(output),
               "formatAlertsEnabled": True, "requestedRepair": False, "completed": False,
               "binding": "Python pywin32 dynamic IDispatch", "records": []}

    def save():
        (output / "word-render-summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    word = document = None
    pythoncom.CoInitialize()
    try:
        # CoCreateInstance creates our own Application; never use GetActiveObject.
        dispatch = pythoncom.CoCreateInstance("Word.Application",
                                              None, pythoncom.CLSCTX_LOCAL_SERVER, pythoncom.IID_IDispatch)
        word = win32com.client.dynamic.Dispatch(dispatch)
        word.Visible = False
        word.DisplayAlerts = -1
        summary["wordVersion"] = str(word.Version)
        for source in sources:
            started = time.monotonic()
            summary["currentFile"] = str(source)
            summary["currentPhase"] = "opening"
            save()
            # ConfirmConversions=true, ReadOnly=true, AddToRecentFiles=false.
            # OpenAndRepair omitted; Office security settings remain unchanged.
            document = word.Documents.Open(str(source), True, True, False)
            summary["currentPhase"] = "opened-updating-fields"
            save()
            document.Fields.Update()
            document.Repaginate()
            for section in document.Sections:
                for footer in section.Footers:
                    footer.Range.Fields.Update()
            pdf = output / (source.stem + ".pdf")
            summary["currentPhase"] = "exporting-pdf"
            save()
            document.ExportAsFixedFormat(str(pdf), 17)
            summary["records"].append({
                "file": str(source), "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "sourceBytes": source.stat().st_size, "pdf": str(pdf),
                "wordVersion": str(word.Version), "compatibilityMode": int(document.CompatibilityMode),
                "wordPages": int(document.ComputeStatistics(2)), "tables": int(document.Tables.Count),
                "inlineShapes": int(document.InlineShapes.Count),
                "pageWidthPoints": float(document.Sections.Item(1).PageSetup.PageWidth),
                "pageHeightPoints": float(document.Sections.Item(1).PageSetup.PageHeight),
                "elapsedMs": round((time.monotonic() - started) * 1000), "openAndExportCompleted": True,
            })
            document.Close(0)
            document = None
            save()
        summary["currentPhase"] = "complete"
        summary["completed"] = True
    except Exception as error:
        summary["error"] = str(error)
        raise
    finally:
        try:
            if document is not None:
                document.Close(0)
        finally:
            try:
                if word is not None:
                    word.Quit(0)
            finally:
                save()
                pythoncom.CoUninitialize()
    print(f"Rendered {len(sources)} DOCX files in Word: {output}")


if __name__ == "__main__":
    main()
