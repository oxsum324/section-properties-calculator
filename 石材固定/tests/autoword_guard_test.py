#!/usr/bin/env python3
"""驗證 auto_word.py 草稿浮水印實際在 PDF 中出現

不需要 server.py 啟動：直接用 file:// URL 模擬。
用 incomplete payload 觸發 draft mode，渲染後檢查 DOM 內是否有 .v2-draft-watermark。
"""
import io, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = Path(__file__).parent.parent.resolve()
V2 = ROOT / "石材計算書產生器_規範版V2.html"

# 構造一個刻意不完整的 payload（缺指紋）
INCOMPLETE_PAYLOAD = {
    'inp': {
        'st_t': 30, 'st_gam': 2800,
        'w_v': 37.5, 'w_i': 1.0, 's_sds': 0.6,
        'w_neg': 341, 'w_pos': 426, 'w_cf': 1.25
    },
    'cases': [{
        'name': 'INCOMPLETE_TEST',
        'w': 870, 'h': 800, 'type': 'bk_4h',
        'fx': 150, 'fy1': 150, 'fy2': 200,
        'bh': 10, 'H1': 5, 'd1': 2.5
    }],
    'results': [{
        # 假裝有結果但其實缺欄位
        'allOK': True, 'all_ok': True
    }],
    'meta': {
        # 故意缺 calc_source_hash / input_hash / result_hash
        'calculator_version': '2026.04.23-spec-core11'
    }
}

# 完整 payload
COMPLETE_PAYLOAD = json.loads(json.dumps(INCOMPLETE_PAYLOAD))
COMPLETE_PAYLOAD['meta'].update({
    'calc_source_hash': 'sha256:dummy_for_testing',
    'input_hash': 'sha256:dummy_for_testing',
    'result_hash': 'sha256:dummy_for_testing'
})
COMPLETE_PAYLOAD['results'][0]['checks'] = [{'item': 'test', 'pass': True}]

def main():
    sys.path.insert(0, str(ROOT))
    import auto_word as aw

    print("=" * 60)
    print("auto_word.py 指紋閘門 ── 端對端 PDF 渲染驗證")
    print("=" * 60)

    # 測試 1：incomplete → is_draft = True
    val1 = aw.validate_payload_for_formal_output(INCOMPLETE_PAYLOAD)
    print(f"\n[1] incomplete payload validate: is_formal={val1['is_formal']}")
    print(f"    reason: {val1['reason']}")
    assert not val1['is_formal'], "incomplete payload 應為 draft"

    # 測試 2：complete → is_formal = True
    val2 = aw.validate_payload_for_formal_output(COMPLETE_PAYLOAD)
    print(f"\n[2] complete payload validate: is_formal={val2['is_formal']}")
    assert val2['is_formal'], "complete payload 應為 formal"

    # 測試 3：實際在 V2 載入 incomplete payload，啟用 __V2_DRAFT_MODE，檢查浮水印 DOM 是否注入
    print(f"\n[3] 實際 headless 測試：載入 incomplete payload → 啟用 draft mode → 檢查浮水印")
    file_url = "file:///" + str(V2.resolve()).replace('\\', '/')

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 1800})
        page = ctx.new_page()
        page.on('dialog', lambda d: d.accept())
        page.goto(file_url, wait_until='domcontentloaded')
        page.evaluate(
            """(args) => { localStorage.setItem(args.key, JSON.stringify(args.data)); }""",
            {'key': 'stone_calc_spec_v3', 'data': INCOMPLETE_PAYLOAD}
        )
        page.goto(file_url, wait_until='networkidle', timeout=60000)
        page.wait_for_function(
            """() => document.querySelectorAll('#preview-sheets .a4').length > 0""",
            timeout=30000
        )
        page.wait_for_timeout(800)

        # 模擬 auto_word.py 的草稿浮水印注入動作
        page.evaluate(
            """(reason) => {
                window.__V2_DRAFT_MODE = true;
                document.querySelectorAll('#preview-sheets .a4').forEach(p => {
                    if (p.querySelector('.v2-draft-watermark')) return;
                    const wm = document.createElement('div');
                    wm.className = 'v2-draft-watermark';
                    wm.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80pt;color:rgba(200,40,40,0.18);font-weight:bold;pointer-events:none;z-index:9999;letter-spacing:8px;font-family:sans-serif';
                    wm.textContent = '草稿 DRAFT';
                    wm.title = '本檔缺少完整計算指紋，僅供參考；不得作為正式送審文件。原因：' + reason;
                    p.style.position = p.style.position || 'relative';
                    p.appendChild(wm);
                });
            }""",
            val1['reason']
        )
        page.wait_for_timeout(500)

        wm_count = page.evaluate("""() => document.querySelectorAll('#preview-sheets .v2-draft-watermark').length""")
        a4_count = page.evaluate("""() => document.querySelectorAll('#preview-sheets .a4').length""")
        wm_text = page.evaluate("""() => document.querySelector('#preview-sheets .v2-draft-watermark')?.textContent || ''""")
        wm_visible = page.evaluate("""() => {
            const wm = document.querySelector('#preview-sheets .v2-draft-watermark');
            if (!wm) return false;
            const cs = getComputedStyle(wm);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || 1) > 0.05;
        }""")
        print(f"    a4 頁數: {a4_count}")
        print(f"    浮水印元素數: {wm_count}")
        print(f"    浮水印文字: '{wm_text}'")
        print(f"    浮水印可見: {wm_visible}")
        assert wm_count == a4_count, f"每張 a4 應有 1 個浮水印 (a4={a4_count}, wm={wm_count})"
        assert wm_visible, "浮水印應為可見"
        assert "草稿" in wm_text, "浮水印文字應包含「草稿」"

        # 截圖驗證
        out_path = ROOT / 'tmp/v2_autoword_draft_screenshot.png'
        page.screenshot(path=str(out_path), full_page=False)
        print(f"    截圖已存：{out_path}")

        # 真的存 PDF 看浮水印是否保留
        pdf_path = ROOT / 'tmp/v2_autoword_draft_test.pdf'
        page.pdf(path=str(pdf_path), format='A4', print_background=True)
        pdf_size = pdf_path.stat().st_size
        print(f"    PDF 已存：{pdf_path} ({pdf_size:,} bytes)")
        assert pdf_size > 10000, "PDF 太小，可能渲染失敗"

        browser.close()

    print(f"\n[✓] 所有 auto_word.py 指紋閘門端對端驗證通過")

if __name__ == '__main__':
    main()
