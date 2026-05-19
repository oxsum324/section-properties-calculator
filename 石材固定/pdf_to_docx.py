# -*- coding: utf-8 -*-
"""
PDF → Word 直接轉檔（保留版面、字級、表格）
用法:
  python pdf_to_docx.py <input.pdf> [output.docx]
  python pdf_to_docx.py                  # 互動：要求拖放或輸入路徑

設計要點:
  - 走 pdf2docx（PyMuPDF 底層），以「版面重建」方式保留：
      * 頁面尺寸、邊界、分頁
      * 中文字型、字級（pt）、粗體、顏色
      * 表格線與格子內容
      * 圖片與 SVG 的點陣化
  - 比起重寫 python-docx（每次字級/版型都要人工校準），此路線貼近原 PDF 版樣
  - 若 PDF 是由 Paged.js 預覽列印產生，轉出 Word 幾乎與 PDF 一致
"""
import sys, os, time
from pathlib import Path


def convert(pdf_path: Path, docx_path: Path, page_range=None):
    try:
        from pdf2docx import Converter
    except ImportError:
        print('❌ 缺少 pdf2docx，請先執行：  pip install pdf2docx')
        sys.exit(2)

    if not pdf_path.exists():
        print(f'❌ 找不到 PDF：{pdf_path}')
        sys.exit(1)

    docx_path.parent.mkdir(parents=True, exist_ok=True)
    if docx_path.exists():
        # 若 Word 正在開啟檔，python-docx 會寫入失敗；先嘗試改名
        try:
            docx_path.unlink()
        except PermissionError:
            backup = docx_path.with_name(docx_path.stem + f'_舊_{int(time.time())}.docx')
            docx_path.rename(backup)
            print(f'⚠ 既有檔案已備份為：{backup.name}')

    print(f'→ 來源 PDF：{pdf_path}')
    print(f'→ 輸出 Word：{docx_path}')
    print('→ 轉檔中（每頁約 3~10 秒，視頁數與複雜度）...')

    t0 = time.time()
    cv = Converter(str(pdf_path))
    try:
        if page_range:
            cv.convert(str(docx_path), start=page_range[0], end=page_range[1])
        else:
            cv.convert(str(docx_path))
    finally:
        cv.close()

    sec = time.time() - t0
    size_mb = docx_path.stat().st_size / 1024 / 1024
    print(f'✔ 完成（{sec:.1f} 秒，{size_mb:.2f} MB）')
    return docx_path


def prompt_path() -> Path:
    print('請拖放 PDF 檔到此視窗後按 Enter，或直接貼上絕對路徑：')
    raw = input().strip().strip('"').strip("'")
    if not raw:
        print('❌ 未提供路徑')
        sys.exit(1)
    return Path(raw)


def main():
    args = sys.argv[1:]
    if not args:
        pdf_path = prompt_path()
    else:
        pdf_path = Path(args[0])

    if len(args) >= 2:
        docx_path = Path(args[1])
    else:
        docx_path = pdf_path.with_suffix('.docx')

    convert(pdf_path, docx_path)

    # 自動開啟（僅 Windows）
    if os.name == 'nt':
        try:
            os.startfile(str(docx_path))
            print('→ 已開啟 Word')
        except Exception as e:
            print(f'（未自動開啟：{e}）')


if __name__ == '__main__':
    main()
