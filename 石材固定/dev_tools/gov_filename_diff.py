#!/usr/bin/env python3
"""V2.6.0：governance fingerprint 檔名比對工具

V2.5.1 將 6 字元 governance fingerprint 寫入匯出檔名末尾（_gov-XXXXXX）。
本腳本協助技師事後比對：
  - 兩份檔案是否來自同一治理狀態（工具 + 規範）
  - 一個資料夾內各專案是否治理一致

用法：
  python gov_filename_diff.py file1.docx file2.docx       # 兩檔比對
  python gov_filename_diff.py path/to/folder/             # 資料夾稽核
  python gov_filename_diff.py --json folder/              # JSON 輸出（CI 友善）
  python gov_filename_diff.py -h                          # 說明

退出碼：
  0 = 全一致 / 比對成功
  1 = 不一致 / 缺後綴 / 參數錯誤
"""
import io
import json
import sys
import re
from pathlib import Path
from collections import defaultdict

try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass

# 匹配 V2.5.1 之 _gov-XXXXXX 後綴（6 字元 hex）
GOV_RE = re.compile(r'_gov-([0-9a-f]{6})')

# V2.5.1 涵蓋之匯出副檔名（exportBaseFilename 主要消費者）
SUPPORTED_EXTS = {'.docx', '.doc', '.xlsx', '.xls', '.csv', '.json', '.pdf'}


def parse_gov(filename):
    """從檔名擷取 _gov-XXXXXX 後綴；無則回 None。"""
    m = GOV_RE.search(Path(filename).name)
    return m.group(1) if m else None


def parse_proj(filename):
    """擷取案名（_gov 之前到第一個底線或全名 stem）。"""
    name = Path(filename).stem
    name = GOV_RE.sub('', name)
    return name.split('_')[0] if '_' in name else name


def cmd_compare_two(f1, f2, as_json=False):
    g1 = parse_gov(f1)
    g2 = parse_gov(f2)
    same = (g1 is not None and g2 is not None and g1 == g2)
    if as_json:
        print(json.dumps({
            'mode': 'compare_two',
            'file1': str(f1), 'gov1': g1,
            'file2': str(f2), 'gov2': g2,
            'consistent': same,
            'has_missing': g1 is None or g2 is None,
        }, ensure_ascii=False, indent=2))
        return 0 if same else 1

    print(f"檔案 1：{f1}")
    print(f"  gov：{g1 or '(無 _gov 後綴)'}")
    print(f"檔案 2：{f2}")
    print(f"  gov：{g2 or '(無 _gov 後綴)'}")
    print()
    if g1 is None or g2 is None:
        print('⚠ 至少一份檔案無 _gov-XXX 後綴；可能來自 file:// 環境匯出或 V2.5.1 之前版本。')
        return 1
    if same:
        print(f"✓ governance 一致（gov: {g1}）— 工具與規範狀態未變動。")
        return 0
    else:
        print('⚠ governance 不一致：')
        print('  → 兩份計算書之工具版本或規範值已有變動。')
        print('  → 請以 result.meta.code_profiles_changelog 與 calc_source_hash 進一步追蹤差異。')
        return 1


def cmd_audit_folder(folder, as_json=False):
    p = Path(folder)
    if not p.is_dir():
        print(f"錯誤：{folder} 不是資料夾", file=sys.stderr)
        return 1
    files = [f for f in p.iterdir()
             if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS]
    by_proj = defaultdict(list)
    for f in files:
        gov = parse_gov(f.name)
        proj = parse_proj(f.name)
        by_proj[proj].append({'name': f.name, 'gov': gov})

    proj_results = {}
    overall_consistent = True
    for proj, items in by_proj.items():
        govs = set(it['gov'] for it in items if it['gov'])
        no_gov_count = sum(1 for it in items if it['gov'] is None)
        if len(govs) <= 1:
            status = 'consistent' if govs else 'no_fingerprint'
        else:
            status = 'inconsistent'
            overall_consistent = False
        proj_results[proj] = {
            'status': status,
            'distinct_govs': sorted(govs),
            'no_gov_count': no_gov_count,
            'total': len(items),
            'items': items,
        }

    if as_json:
        print(json.dumps({
            'mode': 'audit_folder',
            'folder': str(folder),
            'project_count': len(by_proj),
            'overall_consistent': overall_consistent,
            'projects': proj_results,
        }, ensure_ascii=False, indent=2))
        return 0 if overall_consistent else 1

    print(f"審查資料夾：{folder}")
    print(f"專案數：{len(by_proj)}")
    print('=' * 60)
    for proj, info in sorted(proj_results.items()):
        items = info['items']
        if info['status'] == 'consistent':
            g = info['distinct_govs'][0] if info['distinct_govs'] else None
            print(f"\n專案：{proj}")
            print(f"  ✓ governance 一致（gov: {g}） — 共 {info['total']} 份")
        elif info['status'] == 'no_fingerprint':
            print(f"\n專案：{proj}")
            print(f"  ⚠ 全部 {info['total']} 份無 _gov 後綴（舊版本或 file:// 匯出）")
        else:
            print(f"\n專案：{proj}")
            print(f"  ⚠ governance 不一致（{len(info['distinct_govs'])} 種狀態，共 {info['total']} 份）：")
            for g in info['distinct_govs']:
                count = sum(1 for it in items if it['gov'] == g)
                print(f"    - gov:{g} × {count} 份")
            if info['no_gov_count']:
                print(f"    - 無後綴 × {info['no_gov_count']} 份")
        for it in sorted(items, key=lambda x: x['name']):
            tag = it['gov'] or '------'
            print(f"    [{tag}] {it['name']}")
    print()
    print('=' * 60)
    if overall_consistent:
        print('✓ 全部專案治理一致')
    else:
        print('⚠ 至少一個專案有治理不一致')
    return 0 if overall_consistent else 1


def main():
    args = sys.argv[1:]
    as_json = False
    if '--json' in args:
        as_json = True
        args = [a for a in args if a != '--json']
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    if len(args) == 2:
        f1, f2 = Path(args[0]), Path(args[1])
        if f1.is_file() and f2.is_file():
            return cmd_compare_two(f1, f2, as_json=as_json)
        print('錯誤：兩個參數必須皆為檔案路徑', file=sys.stderr)
        return 1
    if len(args) == 1:
        folder = Path(args[0])
        if folder.is_dir():
            return cmd_audit_folder(folder, as_json=as_json)
        print('錯誤：單一參數須為資料夾路徑', file=sys.stderr)
        return 1
    print(__doc__)
    return 1


if __name__ == '__main__':
    sys.exit(main())
