#!/usr/bin/env python3
"""
auto_capture.py — Baseline 自動拍攝腳本（Playwright）

讀取 tests/golden/inputs/*.json 內定義的案例，
逐筆驅動 V2 計算後呼叫 window.__captureBaseline() 並儲存。

用法：
  python auto_capture.py                  # 拍攝所有 inputs/ 內案例
  python auto_capture.py case_01          # 只拍特定案例
  python auto_capture.py --headed         # 顯示瀏覽器（除錯用）
  python auto_capture.py --keep-browser   # 拍完不關瀏覽器（手動驗證用）
"""

import json
import sys
import io
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# Windows cp950 console → 強制 UTF-8 輸出（避免 ✓✗ 編碼錯誤）
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

# ─────────────────────────────────────────────────────────────
# 路徑
# ─────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent.parent.resolve()       # 石材固定/
V2_HTML = ROOT / "石材計算書產生器_規範版V2.html"
INPUTS_DIR = Path(__file__).parent / "inputs"
OUTPUT_DIR = Path(__file__).parent

# ─────────────────────────────────────────────────────────────
# 操作 V2 的輔助函式
# ─────────────────────────────────────────────────────────────
def expand_all_details(page):
    """展開所有 <details>，避免內部 input 被 Playwright 認定為不可見"""
    page.evaluate("""
        () => {
            document.querySelectorAll('details').forEach(d => { d.open = true; });
        }
    """)


def fill_input(page, element_id, value):
    """直接以 JS 設值並觸發事件（繞過 Playwright 的 visibility 檢查；最穩健）"""
    selector = f"#{element_id}"
    try:
        if not page.locator(selector).count():
            return False
        ok = page.evaluate(
            """([id, val]) => {
                const el = document.getElementById(id);
                if (!el) return false;
                if (el.tagName === 'SELECT') {
                    el.value = String(val);
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (el.type === 'checkbox') {
                    el.checked = !!val;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    el.value = String(val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
                return true;
            }""",
            [element_id, value],
        )
        return bool(ok)
    except Exception as e:
        print(f"   [warn] fill {element_id}={value} failed: {e}")
        return False


def reset_v2(page):
    """清空 LocalStorage 並 reload V2，確保乾淨環境"""
    try:
        page.evaluate("() => { try{ localStorage.clear(); }catch(e){} }")
    except Exception:
        pass
    page.reload(wait_until="networkidle")
    page.wait_for_function("() => typeof window.addCase === 'function'", timeout=15000)


def remove_all_cases(page):
    """移除既有所有案例"""
    page.evaluate("""
        () => {
            if (typeof cases !== 'undefined' && Array.isArray(cases)) {
                [...cases].forEach(id => { try{ removeCase(id); }catch(e){} });
            }
        }
    """)


def apply_case(page, case_def):
    """根據 input JSON 設定 V2 全域參數 + 新增一個案例"""
    print(f"  → 套用 {case_def['case_id']}")

    # 預先展開所有 <details> 讓 cc_h/cc_z/cc_A 等可填
    expand_all_details(page)

    # 1. 全域參數
    for key, val in (case_def.get("global_params") or {}).items():
        fill_input(page, key, val)

    # 2. 移除既存案例
    remove_all_cases(page)
    page.wait_for_timeout(150)

    # 3. 透過 addCase API 新增一筆（最穩定方式）
    case_params = case_def.get("case_params") or {}
    page.evaluate(f"data => addCase(data)", case_params)
    page.wait_for_timeout(400)

    # 4. 觸發完整 render（多跑一次以確保 wrap 鏈跑完）
    page.evaluate("() => { if(typeof save==='function') save(); if(typeof render==='function') render(); }")
    page.wait_for_timeout(1200)
    page.evaluate("() => { if(typeof render==='function') render(); }")
    page.wait_for_timeout(800)


def capture_baseline(page, case_def):
    """呼叫 window.__captureBaseline() 取得 baseline 物件（不下載）"""
    result = page.evaluate(
        """async (opts) => {
            if (typeof window.__captureBaseline !== 'function') {
                return { __error: '__captureBaseline not available; ?dev=1 missing?' };
            }
            return await window.__captureBaseline({
                case_id: opts.case_id,
                purpose: opts.purpose,
                title: opts.title || '',
                notes: opts.notes || '',
                deidentify: true,
                download: false,
                captured_by: 'auto_capture.py'
            });
        }""",
        {
            "case_id": case_def["case_id"],
            "purpose": case_def.get("purpose", "characterization"),
            "title": case_def.get("title", ""),
            "notes": case_def.get("notes", ""),
        },
    )
    if not result or result.get("__error"):
        raise RuntimeError(f"capture failed: {result}")
    return result


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────
def main():
    args = sys.argv[1:]
    headed = "--headed" in args
    keep = "--keep-browser" in args
    filter_ids = [a for a in args if not a.startswith("--")]

    if not V2_HTML.exists():
        print(f"✗ V2 HTML 不存在：{V2_HTML}")
        sys.exit(1)
    if not INPUTS_DIR.exists():
        print(f"✗ inputs 目錄不存在：{INPUTS_DIR}")
        sys.exit(1)

    input_files = sorted(INPUTS_DIR.glob("*.json"))
    if filter_ids:
        input_files = [f for f in input_files if any(fid in f.stem for fid in filter_ids)]
    if not input_files:
        print("✗ 找不到任何符合的輸入案例")
        sys.exit(1)

    print(f"準備拍攝 {len(input_files)} 組案例：")
    for f in input_files:
        print(f"  - {f.name}")
    print()

    file_url = "file:///" + str(V2_HTML.resolve()).replace("\\", "/") + "?dev=1"

    summary = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = context.new_page()

        # 禁用對話框（避免 confirm 卡住）
        page.on("dialog", lambda d: d.accept())

        print(f"開啟 V2: {file_url}")
        page.goto(file_url, wait_until="networkidle", timeout=30000)
        page.wait_for_function(
            "() => typeof window.__captureBaseline === 'function'",
            timeout=15000,
        )
        print("✓ V2 dev 模式啟用")
        print()

        for idx, input_file in enumerate(input_files, 1):
            try:
                case_def = json.loads(input_file.read_text(encoding="utf-8"))
                print(f"[{idx}/{len(input_files)}] {case_def['case_id']}")

                reset_v2(page)
                page.wait_for_timeout(200)
                apply_case(page, case_def)
                page.wait_for_timeout(500)

                baseline = capture_baseline(page, case_def)

                # 寫檔
                out_path = OUTPUT_DIR / f"{case_def['case_id']}.json"
                out_path.write_text(
                    json.dumps(baseline, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )

                s = baseline.get("result", {}).get("summary", {}) or {}
                print(
                    f"   ✓ saved → {out_path.name}"
                    f"   Fph={s.get('Fph')}, DCR={s.get('DCR_governing')}, gov={s.get('governing_check')}"
                )
                summary.append({
                    "case_id": case_def["case_id"],
                    "ok": True,
                    "Fph": s.get("Fph"),
                    "DCR": s.get("DCR_governing"),
                    "gov": s.get("governing_check"),
                    "passed": s.get("passed"),
                    "hash": baseline.get("captured_env", {}).get("v2_html_hash", "")[:20] + "…",
                })
            except Exception as e:
                print(f"   ✗ FAILED: {e}")
                summary.append({"case_id": case_def.get("case_id"), "ok": False, "error": str(e)})

        if keep:
            print("\n保持瀏覽器開啟（--keep-browser），按 Enter 結束…")
            input()
        browser.close()

    # ─── 彙總 ───
    print()
    print("=" * 70)
    print("拍攝完成")
    print("=" * 70)
    for s in summary:
        if s.get("ok"):
            print(f"  ✓ {s['case_id']:<32}  Fph={s['Fph']}  DCR={s['DCR']}  pass={s['passed']}  hash={s['hash']}")
        else:
            print(f"  ✗ {s['case_id']:<32}  ERROR: {s.get('error')}")
    ok = sum(1 for s in summary if s.get("ok"))
    print(f"\n  共 {ok}/{len(summary)} 成功")


if __name__ == "__main__":
    main()
