#!/usr/bin/env python3
"""V2.6.0：dev_tools/gov_filename_diff.py 之單元 + 端對端測試"""
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = Path(__file__).parent.parent.resolve()
TOOL = ROOT / 'dev_tools' / 'gov_filename_diff.py'

# 直接 import module 做單元測試
sys.path.insert(0, str(ROOT / 'dev_tools'))
import gov_filename_diff as M  # noqa: E402


def run_cli(*args):
    """以 subprocess 跑 CLI 並回傳 (rc, stdout, stderr)"""
    proc = subprocess.run(
        [sys.executable, str(TOOL), *args],
        capture_output=True, text=True, encoding='utf-8'
    )
    return proc.returncode, proc.stdout, proc.stderr


def make_temp_files(files):
    """建立暫存資料夾並寫入指定檔名（內容空）"""
    td = Path(tempfile.mkdtemp(prefix='gov_test_'))
    for fname in files:
        (td / fname).write_text('', encoding='utf-8')
    return td


def main():
    n = 0
    failed = 0

    def test(name, fn):
        nonlocal n, failed
        n += 1
        try:
            fn()
            print(f"  ✓ [{n}] {name}")
        except AssertionError as e:
            print(f"  ✗ [{n}] {name}\n     {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ [{n}] {name}\n     EXCEPTION: {type(e).__name__}: {e}")
            failed += 1

    print('gov_filename_diff V2.6.0 測試開始')
    print('=' * 60)

    # ── 單元：parse_gov ──
    test('parse_gov：標準命名擷取出 6-hex 後綴', lambda: (
        _eq(M.parse_gov('案A_石材固定計算書_V2.5.2_20260429_0146_gov-17a81d.docx'), '17a81d')
    ))
    test('parse_gov：無 _gov 後綴回 None', lambda: (
        _eq(M.parse_gov('案A_石材固定計算書_V2.5.0_20260429.docx'), None)
    ))
    test('parse_gov：非 6 字元 hex 不匹配', lambda: (
        _eq(M.parse_gov('case_gov-123.docx'), None)
    ))

    # ── 單元：parse_proj ──
    test('parse_proj：取第一個底線之前的案名', lambda: (
        _eq(M.parse_proj('A棟_石材固定計算書_V2.5.2_20260429_0146_gov-17a81d.docx'), 'A棟')
    ))
    test('parse_proj：無底線時取整 stem', lambda: (
        _eq(M.parse_proj('B棟.docx'), 'B棟')
    ))

    # ── 端對端：兩檔比對 ──
    # td: A 兩份 同 gov（一致）；A 第三份 不同 gov（觸發專案不一致）；B 單份；C 無後綴
    td = make_temp_files([
        'A_石材固定計算書_V2.5.2_20260429_0146_gov-17a81d.docx',
        'A_石材固定計算書_V2.5.2_20260429_0150_gov-17a81d.docx',
        'A_石材固定計算書_V2.5.2_20260429_0200_gov-99fffe.docx',  # ← 同專案不同 gov
        'B_石材固定計算書_V2.5.2_20260429_0200_gov-bbbbbb.docx',
        'C_老版.docx',
    ])
    f1 = td / 'A_石材固定計算書_V2.5.2_20260429_0146_gov-17a81d.docx'
    f2 = td / 'A_石材固定計算書_V2.5.2_20260429_0150_gov-17a81d.docx'
    f3 = td / 'A_石材固定計算書_V2.5.2_20260429_0200_gov-99fffe.docx'
    f4 = td / 'C_老版.docx'

    test('CLI：相同 gov 兩檔 rc=0 + 文字含「一致」', lambda: _both(
        lambda: _eq(run_cli(str(f1), str(f2))[0], 0),
        lambda: _contains(run_cli(str(f1), str(f2))[1], '一致')
    ))

    test('CLI：不同 gov 兩檔 rc=1 + 文字含「不一致」', lambda: _both(
        lambda: _eq(run_cli(str(f1), str(f3))[0], 1),
        lambda: _contains(run_cli(str(f1), str(f3))[1], '不一致')
    ))

    test('CLI：缺後綴 rc=1 + 提示舊版本', lambda: _both(
        lambda: _eq(run_cli(str(f1), str(f4))[0], 1),
        lambda: _contains(run_cli(str(f1), str(f4))[1], '無 _gov')
    ))

    # ── 端對端：資料夾稽核 ──
    test('CLI：資料夾稽核 — 含不一致與缺後綴專案 rc=1', lambda: _both(
        lambda: _eq(run_cli(str(td))[0], 1),
        lambda: _contains(run_cli(str(td))[1], '不一致')
    ))

    test('CLI：JSON 輸出 — 結構正確', lambda: _json_ok(run_cli('--json', str(td))))

    # ── 一致性資料夾 → rc=0 ──
    td2 = make_temp_files([
        'X_計算書_V2.5.2_20260429_0146_gov-aaaaaa.docx',
        'X_計算書_V2.5.2_20260429_0150_gov-aaaaaa.xlsx',
        'X_計算書_V2.5.2_20260429_0200_gov-aaaaaa.json',
    ])
    test('CLI：完全一致資料夾 rc=0', lambda: _eq(run_cli(str(td2))[0], 0))

    # ── 說明 / 無參數 ──
    test('CLI：-h 顯示說明 rc=0', lambda: _eq(run_cli('-h')[0], 0))

    print('=' * 60)
    if failed:
        print(f'gov_filename_diff test FAILED ({failed}/{n})')
        return 1
    print(f'gov_filename_diff test passed ({n} tests).')
    return 0


def _eq(actual, expected):
    assert actual == expected, f'expected {expected!r}, got {actual!r}'


def _contains(haystack, needle):
    assert needle in haystack, f'{needle!r} not in output:\n{haystack}'


def _both(*fns):
    for fn in fns:
        fn()


def _json_ok(result):
    rc, out, _ = result
    data = json.loads(out)
    assert data.get('mode') == 'audit_folder'
    assert 'projects' in data
    assert 'overall_consistent' in data


if __name__ == '__main__':
    sys.exit(main())
