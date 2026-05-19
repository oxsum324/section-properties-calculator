# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════╗
║  獨立交叉驗算器 (independent cross-checker)                                ║
║                                                                            ║
║  此工具刻意以**獨立公式實作**驗算 V2 主流程結果，作為「同一案例經兩條    ║
║  路徑算出仍應一致」的工程治理交叉檢查。                                    ║
║                                                                            ║
║  ⚠ 此工具的計算結果**不得直接用於正式計算書**。                           ║
║  ⚠ 計算書數值以 V2 (StoneCalculator) 為唯一信賴源。                       ║
║                                                                            ║
║  使用情境：                                                                ║
║    - 內部品質檢查：兩管道差異 ≤ 容許值 → 通過；                          ║
║    - 差異 > 容許值 → 列為「需人工復核」，由技師判斷哪邊正確。              ║
║                                                                            ║
║  與 generate_docx.py 的差別：                                              ║
║    - generate_docx.py 是 LEGACY，會誤被當作正式輸出路徑（已加 banner）；  ║
║    - 本檔保留獨立公式為「故意設計」，作為交叉驗算的另一條獨立路徑。       ║
╚══════════════════════════════════════════════════════════════════════════╝

檢查 V2 計算（StoneCalculator）與 Python 獨立 calc_case() 是否一致。
用法：
    python verifier.py stone_report_test.json
"""

import json
import math
import sys
from pathlib import Path

from generate_docx import calc_case, normalize_result

# ── 載入容許值配置（dev_tools/verifier.config.json）──
_CONFIG_PATH = Path(__file__).parent / 'dev_tools' / 'verifier.config.json'
try:
    _CONFIG = json.loads(_CONFIG_PATH.read_text(encoding='utf-8'))
except Exception as _e:
    _CONFIG = None
    print(f'[verifier] WARN: 無法載入容許值配置 {_CONFIG_PATH}：{_e}；改用 hardcoded 預設值', flush=True)

# ── 計算欄位 → 容許值類別 對照（自 config 推導）──
_FIELD_TOLERANCE_MAP = {}  # field_name -> { rel_tol, abs_tol }
if _CONFIG:
    by_kind = _CONFIG.get('tolerances', {}).get('by_field_kind', {})
    for kind_name, kind_cfg in by_kind.items():
        for f in kind_cfg.get('applies_to', []):
            _FIELD_TOLERANCE_MAP[f] = {
                'rel_tol': kind_cfg.get('rel_tol', 1e-6),
                'abs_tol': kind_cfg.get('abs_tol', 1e-6),
                'must_not_cross': kind_cfg.get('must_not_cross', None),
                'kind': kind_name,
            }
    _GLOBAL_DEFAULT = _CONFIG.get('tolerances', {}).get('global_default', {})
else:
    _GLOBAL_DEFAULT = {'rel_tol': 1e-6, 'abs_tol': 1e-6}

TOLERANCE = _GLOBAL_DEFAULT.get('rel_tol', 1e-6)
COMPARE_KEYS = (
    'A', 'G', 'Wp', 'Fph', 'PE', 'PEV', 'PW', 'FW',
    'S', 'P', 'T', 'V', 'mc_h1', 'mc_h2',
)


def get_tol(field_name):
    """取得指定欄位的容許值；若無分類資料則 fallback 至 global default。"""
    return _FIELD_TOLERANCE_MAP.get(field_name, _GLOBAL_DEFAULT)


def almost_equal(left, right, tol=None, field_name=None):
    """欄位感知的近似比對。
    - tol 為 None 時，依 field_name 從配置取得 rel/abs；否則用單一 tol（向下相容）
    - field_name 含 must_not_cross 守衛時，跨門檻即使在容許內也視為差異
    """
    try:
        l, r = float(left), float(right)
    except (TypeError, ValueError):
        return left == right

    if tol is not None:
        return math.isclose(l, r, rel_tol=tol, abs_tol=tol)

    cfg = get_tol(field_name) if field_name else _GLOBAL_DEFAULT
    rel = cfg.get('rel_tol', 1e-6)
    abs_ = cfg.get('abs_tol', 1e-6)
    if not math.isclose(l, r, rel_tol=rel, abs_tol=abs_):
        return False
    # must_not_cross 守衛
    must_not_cross = cfg.get('must_not_cross') or []
    for th in must_not_cross:
        if (l - th) * (r - th) < 0:
            return False
    return True


def verify_case(index, case_data, inp, raw_result):
    expected = calc_case(case_data, inp)
    actual = normalize_result(raw_result, case_data, inp)
    if actual is None:
        return [f'案例 {index}: JSON results 缺少必要欄位']

    errors = []
    for key in COMPARE_KEYS:
        if not almost_equal(expected[key], actual[key]):
            errors.append(
                f'案例 {index}: {key} 不一致，JS={actual[key]!r}，PY={expected[key]!r}'
            )

    if expected['gov_wind'] != actual['gov_wind']:
        errors.append(
            f'案例 {index}: gov_wind 不一致，JS={actual["gov_wind"]!r}，PY={expected["gov_wind"]!r}'
        )
    if expected['all_ok'] != actual['all_ok']:
        errors.append(
            f'案例 {index}: all_ok 不一致，JS={actual["all_ok"]!r}，PY={expected["all_ok"]!r}'
        )

    if len(expected['checks']) != len(actual['checks']):
        errors.append(
            f'案例 {index}: checks 筆數不一致，JS={len(actual["checks"])!r}，PY={len(expected["checks"])!r}'
        )
        return errors

    for check_index, (expected_check, actual_check) in enumerate(zip(expected['checks'], actual['checks']), start=1):
        if expected_check['item'] != actual_check['item']:
            errors.append(
                f'案例 {index} 第 {check_index} 項: item 不一致，JS={actual_check["item"]!r}，PY={expected_check["item"]!r}'
            )
        if expected_check['pass'] != actual_check['pass']:
            errors.append(
                f'案例 {index} 第 {check_index} 項: pass 不一致，JS={actual_check["pass"]!r}，PY={expected_check["pass"]!r}'
            )
        if actual_check.get('v') is not None and not almost_equal(expected_check['v'], actual_check['v']):
            errors.append(
                f'案例 {index} 第 {check_index} 項: v 不一致，JS={actual_check["v"]!r}，PY={expected_check["v"]!r}'
            )
        if actual_check.get('a') is not None and not almost_equal(expected_check['a'], actual_check['a']):
            errors.append(
                f'案例 {index} 第 {check_index} 項: a 不一致，JS={actual_check["a"]!r}，PY={expected_check["a"]!r}'
            )

    return errors


def main():
    if len(sys.argv) < 2:
        print('請提供 JSON 檔案路徑，例如：python verifier.py stone_report_test.json')
        raise SystemExit(1)

    json_path = Path(sys.argv[1]).expanduser().resolve()
    data = json.loads(json_path.read_text(encoding='utf-8'))
    inp = data.get('inp', {})
    cases = data.get('cases', [])
    results = data.get('results', [])

    if not results:
        print('JSON 內沒有 results，請先用新版前端重新儲存或匯出。')
        raise SystemExit(1)

    mismatches = []
    for index, (case_data, raw_result) in enumerate(zip(cases, results), start=1):
        mismatches.extend(verify_case(index, case_data, inp, raw_result))

    if mismatches:
        print('發現不一致：')
        for message in mismatches:
            print(f'- {message}')
        raise SystemExit(1)

    print(f'驗證通過：{json_path.name} 共 {len(cases)} 案，JS 與 Python 結果一致。')


if __name__ == '__main__':
    main()
