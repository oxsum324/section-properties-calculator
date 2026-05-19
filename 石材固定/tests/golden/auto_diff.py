#!/usr/bin/env python3
"""
auto_diff.py — Baseline 漂移偵測腳本（Playwright + 比對）

對 inputs/ 內的每組案例：
  1. 重新拍攝當前 V2 結果（in-memory，不存檔）
  2. 與 tests/golden/ 內既存 baseline 比對
  3. 輸出工程師友善 diff 報告
  4. 若任何 case 漂移超過容許值 → exit 1（CI / scheduler 可阻擋）

用法：
  python auto_diff.py                       # 比對全部
  python auto_diff.py case_01               # 只比對特定案例
  python auto_diff.py --headed              # 顯示瀏覽器
  python auto_diff.py --tolerance 0.5       # 自訂容許百分比（預設 1.0）
  python auto_diff.py --report report.txt   # 同時輸出檔案

退出碼：
  0  全部通過
  1  至少一案例漂移超過容許
  2  執行錯誤
"""

import json
import sys
import io
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

# Windows cp950 → UTF-8
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).parent.parent.parent.resolve()
V2_HTML = ROOT / "石材計算書產生器_規範版V2.html"
INPUTS_DIR = Path(__file__).parent / "inputs"
BASELINES_DIR = Path(__file__).parent

# ─────────────────────────────────────────────────────────────
# 共用拍攝邏輯（從 auto_capture 抽出）
# ─────────────────────────────────────────────────────────────
def expand_all_details(page):
    page.evaluate("() => { document.querySelectorAll('details').forEach(d => { d.open = true; }); }")


def fill_input(page, element_id, value):
    selector = f"#{element_id}"
    try:
        if not page.locator(selector).count():
            return False
        return bool(page.evaluate(
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
        ))
    except Exception:
        return False


def reset_v2(page):
    try:
        page.evaluate("() => { try{ localStorage.clear(); }catch(e){} }")
    except Exception:
        pass
    page.reload(wait_until="networkidle")
    page.wait_for_function("() => typeof window.addCase === 'function'", timeout=15000)


def remove_all_cases(page):
    page.evaluate("""
        () => {
            if (typeof cases !== 'undefined' && Array.isArray(cases)) {
                [...cases].forEach(id => { try{ removeCase(id); }catch(e){} });
            }
        }
    """)


def apply_case(page, case_def):
    expand_all_details(page)
    for key, val in (case_def.get("global_params") or {}).items():
        fill_input(page, key, val)
    remove_all_cases(page)
    page.wait_for_timeout(150)
    case_params = case_def.get("case_params") or {}
    page.evaluate("data => addCase(data)", case_params)
    page.wait_for_timeout(400)
    page.evaluate("() => { if(typeof save==='function') save(); if(typeof render==='function') render(); }")
    page.wait_for_timeout(1200)
    page.evaluate("() => { if(typeof render==='function') render(); }")
    page.wait_for_timeout(800)


def capture_baseline(page, case_def):
    return page.evaluate(
        """async (opts) => {
            return await window.__captureBaseline({
                case_id: opts.case_id,
                purpose: opts.purpose,
                title: opts.title || '',
                notes: opts.notes || '',
                deidentify: true,
                download: false,
                captured_by: 'auto_diff.py'
            });
        }""",
        {
            "case_id": case_def["case_id"],
            "purpose": case_def.get("purpose", "characterization"),
            "title": case_def.get("title", ""),
            "notes": case_def.get("notes", ""),
        },
    )


# ─────────────────────────────────────────────────────────────
# Diff 邏輯
# ─────────────────────────────────────────────────────────────
TOLERANCE_DEFAULT_PCT = 1.0   # ±1% 容許（characterization 預設嚴格）
MUST_NOT_CROSS = [0.9, 1.0]   # DCR 不可跨越這些門檻


def diff_value(name, base_val, cur_val, tolerance_pct, lines, status):
    """比對單一數值；status 是 dict: {'fail': bool, 'cross': bool}"""
    if base_val is None and cur_val is None:
        lines.append(f"    ~ {name:24}  baseline=None  current=None  (跳過)")
        return
    if base_val is None or cur_val is None:
        lines.append(f"    ✗ {name:24}  baseline={base_val}  current={cur_val}  (一邊為 None)")
        status["fail"] = True
        return
    if isinstance(base_val, (int, float)) and isinstance(cur_val, (int, float)):
        if base_val == 0:
            err_pct = 0 if cur_val == 0 else 999
        else:
            err_pct = abs((cur_val - base_val) / base_val) * 100
        if err_pct < tolerance_pct:
            lines.append(f"    ✓ {name:24}  {base_val} → {cur_val}  Δ={err_pct:.3f}%")
        else:
            lines.append(f"    ✗ {name:24}  {base_val} → {cur_val}  Δ={err_pct:.3f}%  (超過 ±{tolerance_pct}%)")
            status["fail"] = True
        # must_not_cross 守衛：DCR 跨越 0.9 / 1.0 即使在容許內也視為失敗
        if name == "DCR_governing":
            for thresh in MUST_NOT_CROSS:
                base_side = base_val < thresh
                cur_side = cur_val < thresh
                if base_side != cur_side:
                    lines.append(f"    ⚠ {name} 跨越門檻 {thresh}：baseline 在{'下' if base_side else '上'}，current 在{'下' if cur_side else '上'}")
                    status["cross"] = True
                    status["fail"] = True
    else:
        if base_val == cur_val:
            lines.append(f"    ✓ {name:24}  {base_val!r}  (不變)")
        else:
            lines.append(f"    ✗ {name:24}  {base_val!r} → {cur_val!r}")
            status["fail"] = True


def diff_baseline(baseline, current, tolerance_pct):
    """比對 baseline JSON 與 current capture，回傳 (passed, lines)"""
    lines = []
    status = {"fail": False, "cross": False}

    case_id = baseline.get("case_id", "?")
    lines.append(f"\n  ── {case_id} ──")
    lines.append(f"    purpose: {baseline.get('purpose')}")

    # 環境指紋比對
    base_env = baseline.get("captured_env", {})
    cur_env = current.get("captured_env", {})
    if base_env.get("v2_html_hash") != cur_env.get("v2_html_hash"):
        lines.append(f"    ℹ V2 HTML hash 已變動：")
        lines.append(f"        baseline: {base_env.get('v2_html_hash', '')[:24]}…")
        lines.append(f"        current:  {cur_env.get('v2_html_hash', '')[:24]}…")
    else:
        lines.append(f"    ✓ V2 HTML hash 相同：{base_env.get('v2_html_hash','')[:24]}…")

    # result.summary 比對
    base_sum = (baseline.get("result") or {}).get("summary") or {}
    cur_sum = (current.get("result") or {}).get("summary") or {}
    lines.append("    -- result.summary --")
    for key in ["Fph", "Tmax", "Vmax", "DCR_governing", "governing_check", "passed"]:
        diff_value(key, base_sum.get(key), cur_sum.get(key), tolerance_pct, lines, status)

    return (not status["fail"], status, lines)


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────
def main():
    args = sys.argv[1:]
    headed = "--headed" in args
    tolerance = TOLERANCE_DEFAULT_PCT
    report_path = None
    filter_ids = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--tolerance" and i + 1 < len(args):
            tolerance = float(args[i + 1]); i += 2
        elif a == "--report" and i + 1 < len(args):
            report_path = Path(args[i + 1]); i += 2
        elif a.startswith("--"):
            i += 1
        else:
            filter_ids.append(a); i += 1

    input_files = sorted(INPUTS_DIR.glob("*.json"))
    if filter_ids:
        input_files = [f for f in input_files if any(fid in f.stem for fid in filter_ids)]
    if not input_files:
        print("✗ 找不到任何符合的輸入案例")
        sys.exit(2)

    print(f"=== Baseline Drift 偵測 ===")
    print(f"容許誤差：±{tolerance}%")
    print(f"案例數：{len(input_files)}")
    print(f"必不可跨門檻：{MUST_NOT_CROSS}")
    print()

    file_url = "file:///" + str(V2_HTML.resolve()).replace("\\", "/") + "?dev=1"
    all_lines = []
    overall_fail = False
    case_results = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = context.new_page()
        page.on("dialog", lambda d: d.accept())

        page.goto(file_url, wait_until="networkidle", timeout=30000)
        page.wait_for_function(
            "() => typeof window.__captureBaseline === 'function'",
            timeout=15000,
        )

        for input_file in input_files:
            case_def = json.loads(input_file.read_text(encoding="utf-8"))
            case_id = case_def["case_id"]
            baseline_path = BASELINES_DIR / f"{case_id}.json"
            if not baseline_path.exists():
                msg = f"\n  ── {case_id} ──\n    ✗ 缺少 baseline 檔：{baseline_path.name}（請先執行 auto_capture.py）"
                all_lines.append(msg)
                print(msg)
                overall_fail = True
                case_results.append((case_id, "MISSING"))
                continue

            try:
                reset_v2(page)
                page.wait_for_timeout(200)
                apply_case(page, case_def)
                page.wait_for_timeout(500)
                current = capture_baseline(page, case_def)

                baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
                ok, status, lines = diff_baseline(baseline, current, tolerance)
                all_lines.extend(lines)
                for ln in lines:
                    print(ln)

                if ok:
                    case_results.append((case_id, "PASS"))
                elif status["cross"]:
                    case_results.append((case_id, "CROSS"))
                    overall_fail = True
                else:
                    case_results.append((case_id, "FAIL"))
                    overall_fail = True

            except Exception as e:
                msg = f"\n  ── {case_id} ──\n    ✗ 執行錯誤：{e}"
                all_lines.append(msg)
                print(msg)
                overall_fail = True
                case_results.append((case_id, "ERROR"))

        browser.close()

    # ── 彙總 ──
    print()
    print("=" * 70)
    print("Drift 偵測結果")
    print("=" * 70)
    pass_cnt = sum(1 for _, s in case_results if s == "PASS")
    for cid, sta in case_results:
        mark = {"PASS": "✓", "FAIL": "✗", "CROSS": "⚠", "MISSING": "?", "ERROR": "!"}[sta]
        print(f"  {mark} {cid:<32}  {sta}")
    print(f"\n  通過 {pass_cnt}/{len(case_results)} 　容許 ±{tolerance}%")

    # 寫報告
    if report_path:
        report_lines = [
            f"Baseline Drift Report",
            f"=====================",
            f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"Tolerance: ±{tolerance}%",
            f"Total cases: {len(case_results)} | Pass: {pass_cnt} | Fail: {len(case_results)-pass_cnt}",
            f""
        ]
        report_lines.extend(all_lines)
        report_lines.append("")
        report_lines.append("=" * 70)
        report_lines.append("Summary:")
        for cid, sta in case_results:
            report_lines.append(f"  {cid}: {sta}")
        report_path.write_text("\n".join(report_lines), encoding="utf-8")
        print(f"\n報告已寫入：{report_path}")

    sys.exit(1 if overall_fail else 0)


if __name__ == "__main__":
    main()
