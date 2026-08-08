from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
from typing import Any
import unicodedata

import numpy as np
from pypdf import PdfReader
import pypdfium2 as pdfium
from rapidocr_onnxruntime import RapidOCR


CANONICAL_RENDER_EVIDENCE_KIND = "attachment-canonical-render-evidence.v1"
OCR_ALIGNMENT_SCHEMA_VERSION = 1
OCR_ALIGNMENT_METHOD = "rendered-page-ocr-text-layer-bigram-alignment"
OCR_MINIMUM_PAGE_SCORE = 0.50
OCR_RENDER_SCALE = 1.50

_thread_local = threading.local()


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _normalized_alignment_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).lower()
    return "".join(character for character in normalized if character.isalnum())


def _bigram_dice_score(left: str, right: str) -> float:
    normalized_left = _normalized_alignment_text(left)
    normalized_right = _normalized_alignment_text(right)
    left_bigrams = {normalized_left[index : index + 2] for index in range(max(0, len(normalized_left) - 1))}
    right_bigrams = {normalized_right[index : index + 2] for index in range(max(0, len(normalized_right) - 1))}
    if not left_bigrams and not right_bigrams:
        return 1.0
    if not left_bigrams or not right_bigrams:
        return 0.0
    return 2.0 * len(left_bigrams & right_bigrams) / (len(left_bigrams) + len(right_bigrams))


def _ocr_engine() -> RapidOCR:
    engine = getattr(_thread_local, "rapid_ocr", None)
    if engine is None:
        engine = RapidOCR()
        _thread_local.rapid_ocr = engine
    return engine


def _page_metrics(image: np.ndarray) -> dict[str, Any]:
    if image.ndim == 3:
        rgb = image[:, :, :3].astype(np.float32)
        gray = rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114
    else:
        gray = image.astype(np.float32)
    mask = gray < 245
    height, width = mask.shape
    ink_pixels = int(mask.sum())
    bounds: dict[str, int] | None = None
    if ink_pixels:
        ys, xs = np.nonzero(mask)
        bounds = {
            "minX": int(xs.min()),
            "minY": int(ys.min()),
            "maxX": int(xs.max()),
            "maxY": int(ys.max()),
        }
    return {
        "width": int(width),
        "height": int(height),
        "inkPixels": ink_pixels,
        "inkRatio": ink_pixels / float(width * height),
        "bounds": bounds,
    }


def _ocr_page(page_number: int, image: np.ndarray, text_layer: str) -> tuple[dict[str, Any], dict[str, Any]]:
    result, _ = _ocr_engine()(image)
    ocr_text = " ".join(str(item[1]).strip() for item in (result or []) if len(item) > 1 and str(item[1]).strip())
    normalized_text_layer = _normalized_alignment_text(text_layer)
    normalized_ocr = _normalized_alignment_text(ocr_text)
    score = _bigram_dice_score(text_layer, ocr_text)
    if len(normalized_text_layer) < 40:
        raise ValueError(f"PDF 第 {page_number} 頁文字層不足，無法建立正式可見性證據")
    if len(normalized_ocr) < max(30, int(len(normalized_text_layer) * 0.50)):
        raise ValueError(f"PDF 第 {page_number} 頁 OCR 可見文字不足，無法建立正式可見性證據")
    if score < OCR_MINIMUM_PAGE_SCORE:
        raise ValueError(
            f"PDF 第 {page_number} 頁 OCR 與文字層對齊率 {score:.3f} 低於 {OCR_MINIMUM_PAGE_SCORE:.2f}"
        )
    metrics = _page_metrics(image)
    if metrics["inkPixels"] <= 0:
        raise ValueError(f"PDF 第 {page_number} 頁沒有可辨識像素內容")
    alignment = {
        "page": page_number,
        "textLayerText": text_layer,
        "textLayerSha256": _sha256_bytes(text_layer.encode("utf-8")),
        "ocrText": ocr_text,
        "ocrTextSha256": _sha256_bytes(ocr_text.encode("utf-8")),
        "score": round(score, 6),
    }
    return {"page": page_number, **metrics}, alignment


def build_pdf_canonical_render_evidence(
    pdf_path: Path,
    *,
    content_boundary_profile: str = "traceable-calculation-book",
    max_workers: int = 4,
) -> Path:
    pdf_path = Path(pdf_path).resolve()
    if pdf_path.suffix.lower() != ".pdf" or not pdf_path.is_file():
        raise ValueError("只接受既有 PDF 建立 canonical render evidence")
    evidence_path = pdf_path.with_name(f"{pdf_path.stem}.canonical-render.evidence.json")
    if evidence_path.exists():
        raise FileExistsError(f"可見性證據已存在：{evidence_path.name}")

    initial_stat = pdf_path.stat()
    artifact_bytes = pdf_path.read_bytes()
    artifact_sha256 = _sha256_bytes(artifact_bytes)
    reader = PdfReader(str(pdf_path))
    text_layers = [" ".join((page.extract_text() or "").split()) for page in reader.pages]
    pdf_document = pdfium.PdfDocument(str(pdf_path))
    try:
        if len(pdf_document) != len(text_layers) or not text_layers:
            raise ValueError("PDF 頁數或文字層無法建立一致的可見性證據")
        images = [
            np.asarray(pdf_document[index].render(scale=OCR_RENDER_SCALE).to_pil().convert("RGB"))
            for index in range(len(pdf_document))
        ]
    finally:
        pdf_document.close()

    worker_count = max(1, min(int(max_workers), len(images), 4))
    with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="pdf-ocr") as pool:
        verified_pages = list(
            pool.map(
                lambda values: _ocr_page(*values),
                ((index + 1, image, text_layers[index]) for index, image in enumerate(images)),
            )
        )
    pages = [item[0] for item in verified_pages]
    alignments = [item[1] for item in verified_pages]
    visible_text = "\f".join(text_layers)
    minimum_score = min(float(item["score"]) for item in alignments)
    average_score = sum(float(item["score"]) for item in alignments) / len(alignments)

    final_stat = pdf_path.stat()
    final_bytes = pdf_path.read_bytes()
    if (
        final_stat.st_size != initial_stat.st_size
        or final_stat.st_mtime_ns != initial_stat.st_mtime_ns
        or _sha256_bytes(final_bytes) != artifact_sha256
    ):
        raise RuntimeError("PDF 在建立可見性證據期間發生變更")

    evidence = {
        "kind": CANONICAL_RENDER_EVIDENCE_KIND,
        "artifact": pdf_path.name,
        "artifactSha256": artifact_sha256,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "renderer": "reportlab-pdfium-rapidocr-alignment",
        "pdf": {
            "pageCount": len(pages),
            "pages": pages,
            "visibleText": {
                "source": "rendered-page-ocr",
                "method": OCR_ALIGNMENT_METHOD,
                "generatedInSamePrintSession": False,
                "derivedFromRenderedPages": True,
                "text": visible_text,
                "textLength": len(visible_text),
                "textSha256": _sha256_bytes(visible_text.encode("utf-8")),
                "contentBoundary": {
                    "profile": content_boundary_profile,
                    "missingGroups": [],
                },
                "alignment": {
                    "schemaVersion": OCR_ALIGNMENT_SCHEMA_VERSION,
                    "engine": "rapidocr-onnxruntime",
                    "algorithm": "normalized-alphanumeric-bigram-dice",
                    "renderScale": OCR_RENDER_SCALE,
                    "minimumRequiredScore": OCR_MINIMUM_PAGE_SCORE,
                    "minimumPageScore": round(minimum_score, 6),
                    "averagePageScore": round(average_score, 6),
                    "pageCount": len(alignments),
                    "pages": alignments,
                },
            },
        },
    }
    encoded = (json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="xb",
            prefix=f".{evidence_path.name}.",
            suffix=".tmp",
            dir=evidence_path.parent,
            delete=False,
        ) as stream:
            temp_path = Path(stream.name)
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        if evidence_path.exists():
            raise FileExistsError(f"可見性證據已存在：{evidence_path.name}")
        os.replace(temp_path, evidence_path)
        temp_path = None
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
    return evidence_path
