# -*- coding: utf-8 -*-
"""
自動匯出 Word：HTML 工具 → PDF（Chromium 列印）→ DOCX（pdf2docx）
流程全自動，無需人工存檔。

設計：
  1. Playwright 啟動 headless Chromium
  2. 開啟本機伺服器上的石材工具 HTML
  3. 將 project payload 注入 localStorage → reload → 等 render() 完成
  4. emulate_media('print') + page.pdf() 取得 PDF 位元（走 @media print 規則，
     完整套用我們對齊後的樣式）
  5. pdf2docx 將 PDF → DOCX（保留字級、表格、版面）
  6. 回傳 DOCX bytes
"""
import sys, os, json, time, tempfile, io, uuid
from pathlib import Path

# Windows 主控台多為 cp950，避免 ✔/→ 編碼錯誤
if os.name == 'nt' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


TOOL_URL = 'http://127.0.0.1:8765/石材固定/石材計算書產生器_規範版V2.html'
STORAGE_KEY = 'stone_calc_spec_v3'  # 與 V2 HTML 端一致


def safe_filename(name, fallback='石材固定構件'):
    cleaned = ''.join('_' if c in r'\/:*?"<>|' else c for c in str(name or ''))
    cleaned = ' '.join(cleaned.split()).strip()
    return cleaned or fallback


def export_stem_from_payload(payload: dict, kind: str = '計算書') -> str:
    inp = payload.get('inp') if isinstance(payload.get('inp'), dict) else {}
    meta = payload.get('meta') if isinstance(payload.get('meta'), dict) else {}
    proj = safe_filename(inp.get('proj') or '石材固定構件')
    version = safe_filename(meta.get('app_version') or 'V2', 'V2')
    return safe_filename(f'{proj}_石材固定{kind}_{version}_{time.strftime("%Y%m%d_%H%M%S")}')


def validate_payload_for_formal_output(payload: dict) -> dict:
    """V2 治理鏈閘門：檢查 payload 是否含產生「正式計算書」所需的指紋與計算結果。

    回傳 {
      'is_formal': True/False,
      'missing': [...],  # 缺失欄位清單
      'reason': '...'    # 短描述
    }

    此檢查只回報追溯資料完整性，不決定文件是否為正式附件。
    """
    if not isinstance(payload, dict):
        return {'is_formal': False, 'missing': ['payload'], 'reason': 'payload 非 dict'}
    missing = []
    meta = payload.get('meta') or {}
    results = payload.get('results') or []

    # 計算結果是否齊全
    if not results:
        missing.append('results')
    if not isinstance(results, list) or any(not isinstance(r, dict) or not r.get('checks') for r in results):
        missing.append('results.checks')

    # 公式自動指紋（http:// 才會有；file:// 受限為 None）
    # 可選：若沒有 calc_source_hash 視為「離線環境」，回報追溯資料不完整
    if not meta.get('calc_source_hash'):
        missing.append('meta.calc_source_hash')

    # 三層交付指紋
    for k in ('input_hash', 'result_hash'):
        if not meta.get(k):
            missing.append(f'meta.{k}')

    # Calculator 與 Registry 版本
    if not meta.get('calculator_version'):
        missing.append('meta.calculator_version')

    is_formal = len(missing) == 0
    reason = '追溯資料完整（含指紋與計算結果）' if is_formal else f'缺少 {len(missing)} 項：{", ".join(missing)}'
    return {'is_formal': is_formal, 'missing': missing, 'reason': reason}


def render_payload_to_pdf(payload: dict, out_pdf: Path, tool_url: str = TOOL_URL,
                          enforce_fingerprint: bool = True):
    """用 headless Chromium 載入工具 → 用 Paged.js 分頁 → 存 PDF。
    走 Paged.js 分頁而非原生 @media print，才能支援 target-counter 讓
    TOC 頁碼對齊實際列印頁次。

    指紋檢查只做追溯提示；文件狀態由 payload.document.approved 明確決定。
    """
    # ── V2 指紋閘門 ──
    validation = validate_payload_for_formal_output(payload)
    if enforce_fingerprint and not validation['is_formal']:
        print(f"[auto_word] ⚠ 追溯資料待確認（{validation['reason']}）", flush=True)
    else:
        print(f"[auto_word] ✓ {validation['reason']}", flush=True)

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 1800})
        page = ctx.new_page()

        # 第一次載入（只為了寫 localStorage）
        page.goto(tool_url, wait_until='domcontentloaded', timeout=60000)
        page.evaluate(
            """(args) => { localStorage.setItem(args.key, JSON.stringify(args.data)); }""",
            {'key': STORAGE_KEY, 'data': payload},
        )
        # 重新載入以讓 load() 讀 localStorage 並呼叫 render()
        page.goto(tool_url, wait_until='networkidle', timeout=60000)
        page.wait_for_function(
            """() => document.querySelectorAll('#preview-sheets .a4').length > 0""",
            timeout=30000,
        )
        page.wait_for_load_state('networkidle')
        time.sleep(0.5)

        # 文件狀態只由明確核可值決定；缺指紋不再加上大面積 DRAFT 浮水印。
        page.evaluate(
            """(approved) => {
                const checkbox = document.getElementById('v2_attachment_approved');
                if (!checkbox) return;
                checkbox.checked = approved === true;
                if (typeof window.v2SetAttachmentApproval === 'function') {
                    window.v2SetAttachmentApproval(checkbox.checked);
                }
            }""",
            bool((payload.get('document') or {}).get('approved')),
        )
        time.sleep(0.2)

        # 在原頁呼叫 buildPagedPrintHtml + promoteAnchorIds，組 Paged.js HTML
        paged_html = page.evaluate(
            """() => {
              const sheets = window.buildPrintableSheetsHtml
                ? window.buildPrintableSheetsHtml()
                : document.getElementById('preview-sheets').innerHTML;
              const promoted = window.promoteAnchorIds ? window.promoteAnchorIds(sheets) : sheets;
              const title = window.sanitizeFilename
                ? window.sanitizeFilename((window.inputs && window.inputs().proj) || '石材計算書')
                : '石材計算書';
              return window.buildPagedPrintHtml(title, promoted, false);
            }"""
        )

        # 另開 page 執行 Paged.js 分頁
        paged = ctx.new_page()
        # 先 goto 工具目錄讓 paged.polyfill.js 相對路徑解析
        paged.goto(tool_url.rsplit('/', 1)[0] + '/_paged_blank.html',
                   wait_until='domcontentloaded', timeout=10000)
        paged.set_content(paged_html, wait_until='networkidle', timeout=90000)

        # 等 Paged.js 完成：.pagedjs_page 數量穩定
        last, stable = -1, 0
        for _ in range(120):
            time.sleep(0.5)
            cnt = paged.evaluate("() => document.querySelectorAll('.pagedjs_page').length")
            if cnt == last: stable += 1
            else: stable, last = 0, cnt
            if stable >= 5 and cnt > 0: break

        paged.pdf(
            path=str(out_pdf),
            format='A4',
            print_background=True,
            prefer_css_page_size=True,
        )

        browser.close()
    return out_pdf


def pdf_to_docx(pdf_path: Path, docx_path: Path):
    from pdf2docx import Converter
    cv = Converter(str(pdf_path))
    try:
        cv.convert(str(docx_path))
    finally:
        cv.close()
    return docx_path


def unique_export_paths(out_dir: Path, stem: str):
    """回傳不覆蓋既有輸出的 PDF/DOCX 路徑。"""
    base_pdf = out_dir / f'{stem}.pdf'
    base_docx = out_dir / f'{stem}.docx'
    if not base_pdf.exists() and not base_docx.exists():
        return base_pdf, base_docx

    suffix = f'{time.strftime("%Y%m%d_%H%M%S")}_{uuid.uuid4().hex[:8]}'
    return out_dir / f'{stem}_{suffix}.pdf', out_dir / f'{stem}_{suffix}.docx'


def auto_export_word(payload: dict, out_dir: Path, stem: str = '石材計算書') -> Path:
    """一鍵：payload → PDF → DOCX，回傳 DOCX 路徑。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path, docx_path = unique_export_paths(out_dir, stem)

    t0 = time.time()
    print(f'[1/2] 渲染 PDF → {pdf_path.name}')
    render_payload_to_pdf(payload, pdf_path)
    print(f'      完成 ({time.time()-t0:.1f}s)')

    t1 = time.time()
    print(f'[2/2] 轉 DOCX → {docx_path.name}')
    pdf_to_docx(pdf_path, docx_path)
    print(f'      完成 ({time.time()-t1:.1f}s)')

    return docx_path


def main():
    """CLI：從 JSON 檔讀 payload，輸出到同目錄。"""
    if len(sys.argv) < 2:
        print('用法：python auto_word.py <payload.json> [output_dir]')
        sys.exit(1)

    payload_file = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else payload_file.parent

    payload = json.loads(payload_file.read_text(encoding='utf-8'))
    stem = export_stem_from_payload(payload, '計算書')

    docx = auto_export_word(payload, out_dir, stem)
    print(f'✔ {docx}')

    if os.name == 'nt':
        try:
            os.startfile(str(docx))
        except Exception:
            pass


if __name__ == '__main__':
    main()
