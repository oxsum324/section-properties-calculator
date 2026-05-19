#!/usr/bin/env python3
"""ci_summary.py — 將 run_all_tests.bat 的 log 整理為精簡摘要報告"""
import io, sys, re, json
from pathlib import Path
from datetime import datetime

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass

def main():
    if len(sys.argv) < 2:
        print('用法：python ci_summary.py <run_log.log>')
        sys.exit(1)
    log_path = Path(sys.argv[1])
    if not log_path.exists():
        print(f'log 檔不存在：{log_path}')
        sys.exit(1)

    text = log_path.read_text(encoding='utf-8', errors='replace')

    # 解析各區段結果
    sections = {
        'smoke_calc':        ('regression smoke', re.search(r'StoneCalculator\s+(\S+)\s+regression smoke tests passed', text)),
        'smoke_formula':     ('formula-registry', re.search(r'StoneFormulaRegistry\s+(\S+)\s+covers (\d+) observed checks', text)),
        'smoke_dashboard':   ('review-dashboard', re.search(r'StoneReviewDashboard smoke test passed', text)),
        'smoke_versionsync': ('version-sync', re.search(r'StoneVersionSync smoke test passed', text)),
        'smoke_schema':      ('input-schema', re.search(r'StoneInputSchema\s+(\S+)\s+smoke test passed\s*\((\d+)\s*tests?\)', text)),
        'smoke_codeprofiles':('code-profiles', re.search(r'StoneCodeProfiles\s+(\S+)\s+smoke test passed\s*\((\d+)\s*tests?\)', text)),
        'syntax':            ('V2 HTML inline JS syntax', re.search(r'Total inline scripts:\s*(\d+),\s*failed:\s*(\d+)', text)),
        'drift':             ('baseline drift', re.search(r'通過\s*(\d+)/(\d+)\s+容許', text)),
        'autoword':          ('auto_word fingerprint gate', '所有 auto_word.py 指紋閘門端對端驗證通過' in text),
        'visual':            ('visual decoration', '視覺裝飾測試全通過' in text),
    }

    results = {}
    for key, (label, m) in sections.items():
        if m is None or m is False:
            results[key] = { 'label': label, 'status': 'FAIL', 'detail': '未找到對應字串' }
        elif isinstance(m, bool):
            results[key] = { 'label': label, 'status': 'PASS' if m else 'FAIL', 'detail': '' }
        else:
            if key == 'syntax':
                total, failed = int(m.group(1)), int(m.group(2))
                results[key] = {
                    'label': label,
                    'status': 'PASS' if failed == 0 else 'FAIL',
                    'detail': f'{total} scripts, {failed} failed'
                }
            elif key == 'drift':
                passed, total = int(m.group(1)), int(m.group(2))
                results[key] = {
                    'label': label,
                    'status': 'PASS' if passed == total else 'FAIL',
                    'detail': f'{passed}/{total}'
                }
            elif key == 'smoke_formula':
                results[key] = {
                    'label': label,
                    'status': 'PASS',
                    'detail': f'{m.group(1)}, {m.group(2)} checks'
                }
            elif key == 'smoke_calc':
                results[key] = {
                    'label': label,
                    'status': 'PASS',
                    'detail': m.group(1)
                }
            elif key == 'smoke_schema' or key == 'smoke_codeprofiles':
                results[key] = {
                    'label': label,
                    'status': 'PASS',
                    'detail': f'{m.group(1)}, {m.group(2)} tests'
                }
            else:
                results[key] = { 'label': label, 'status': 'PASS', 'detail': '' }

    pass_n = sum(1 for r in results.values() if r['status'] == 'PASS')
    fail_n = sum(1 for r in results.values() if r['status'] == 'FAIL')
    overall = 'PASS' if fail_n == 0 else 'FAIL'

    print()
    print('=' * 64)
    print(f'V2 全測試套件 CI 摘要 — {overall}')
    print('=' * 64)
    for r in results.values():
        sym = '✓' if r['status'] == 'PASS' else '✗'
        detail = f'   {r["detail"]}' if r['detail'] else ''
        print(f'  {sym} {r["label"]:<30} {r["status"]}{detail}')
    print('-' * 64)
    print(f'  {pass_n} PASS / {fail_n} FAIL  總計 {pass_n + fail_n} 項')
    print('=' * 64)

    # 寫 JSON 摘要供其他工具消費
    summary_json = {
        'overall': overall,
        'pass_count': pass_n,
        'fail_count': fail_n,
        'results': results,
        'log_file': str(log_path),
        'generated_at': datetime.now().isoformat()
    }
    json_out = log_path.parent / '_last_summary.json'
    json_out.write_text(json.dumps(summary_json, indent=2, ensure_ascii=False), encoding='utf-8')

    sys.exit(0 if overall == 'PASS' else 1)

if __name__ == '__main__':
    main()
