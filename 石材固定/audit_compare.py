# -*- coding: utf-8 -*-
"""Compare two stone export audit JSON reports."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from audit_schema import missing_audit_paths, nested
import re


GRADE_RANK = {'A': 1, 'B': 2, 'C': 3}
DEFAULT_AUDIT_DIR = Path('output')

# V3.0.2：StoneGovernanceProtocol v1.0 規格驗證器（Python 版，與 JS 版邏輯對等）
# 對應 dev_tools/StoneGovernanceProtocol-v1.0.md 之 9 項合規條款
SUPPORTED_PROTOCOL_PATTERN = re.compile(r'^1\.0\.\d+$')
SHA256_PATTERN = re.compile(r'^sha256:[0-9a-f]{64}$')
CYRB53_PATTERN = re.compile(r'^cyrb53:[0-9a-f]{14}$')
GOV_PATTERN = re.compile(r'^gov:[0-9a-f]{14}$')
ACK_PATTERN = re.compile(r'^ack:[0-9a-f]{14}$')


def validate_governance_meta(meta: dict[str, Any] | Any) -> dict[str, Any]:
    """Python 版規格驗證器；回傳 { ok, version, errors[], warnings[] }"""
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(meta, dict):
        return {'ok': False, 'version': None, 'errors': ['meta 不是 dict'], 'warnings': []}

    pv = meta.get('governance_protocol_version')
    if not pv:
        errors.append('缺 governance_protocol_version')
    elif not SUPPORTED_PROTOCOL_PATTERN.match(str(pv)):
        errors.append(f'不支援的 protocol version：{pv}（本驗證器支援 1.0.x）')

    for f in ('input_hash', 'normalized_input_hash', 'result_hash'):
        v = meta.get(f)
        if not v:
            warnings.append(f'缺 {f}（建議寫入）')
        elif not SHA256_PATTERN.match(str(v)):
            errors.append(f'{f} 不符 SHA-256 格式：{v}')

    csh = meta.get('calc_source_hash')
    if csh and not SHA256_PATTERN.match(str(csh)):
        errors.append(f'calc_source_hash 不符 SHA-256 格式：{csh}')
    elif not csh:
        warnings.append('calc_source_hash 為空（file:// 環境合理；http:// 環境應產生）')

    cph = meta.get('code_profiles_hashes')
    if not isinstance(cph, dict):
        errors.append('缺 code_profiles_hashes')
    else:
        for scope, info in cph.items():
            h = (info or {}).get('hash') if isinstance(info, dict) else None
            if not h or not CYRB53_PATTERN.match(str(h)):
                errors.append(f'code_profiles_hashes[{scope}].hash 不符 cyrb53 格式：{h}')

    gfp = meta.get('governance_fingerprint')
    if gfp and not GOV_PATTERN.match(str(gfp)):
        errors.append(f'governance_fingerprint 不符 gov: 格式：{gfp}')

    ackh = meta.get('governance_ack_hash')
    if ackh and not ACK_PATTERN.match(str(ackh)):
        errors.append(f'governance_ack_hash 不符 ack: 格式：{ackh}')

    if gfp and not csh:
        errors.append('governance_fingerprint 存在但 calc_source_hash 為空（違反 spec § 5.2）')

    return {
        'ok': len(errors) == 0,
        'version': pv or None,
        'errors': errors,
        'warnings': warnings,
    }


def load_audit(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(data, dict):
        raise ValueError(f'{path} is not a JSON object')
    if data.get('report_type') != 'stone_calc_export_audit':
        raise ValueError(f'{path} is not a stone export audit report')
    return data


def latest_audit_reports(base_dir: Path, count: int = 2) -> list[Path]:
    if not base_dir.is_dir():
        raise FileNotFoundError(f'Audit report directory not found: {base_dir}')
    reports = [
        path for path in base_dir.glob('*_驗證報告.json')
        if path.is_file()
    ]
    reports.sort(key=lambda path: (path.stat().st_mtime, path.name), reverse=True)
    if len(reports) < count:
        raise ValueError(f'Need at least {count} audit reports in {base_dir}, found {len(reports)}')
    return list(reversed(reports[:count]))


def as_number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {'true', '1', 'yes', 'y'}:
            return True
        if text in {'false', '0', 'no', 'n'}:
            return False
    if isinstance(value, (int, float)):
        return value != 0
    return default


def grade_code(report: dict[str, Any]) -> str:
    raw = str(nested(report, 'review', 'delivery_quality', 'code', default='')).strip().upper()
    if raw in GRADE_RANK:
        return raw
    text = str(nested(report, 'review', 'delivery_quality', 'text', default='')).strip().upper()
    return text[:1] if text[:1] in GRADE_RANK else 'C'


def extract_metrics(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get('summary') if isinstance(report.get('summary'), dict) else {}
    review = report.get('review') if isinstance(report.get('review'), dict) else {}
    formula = nested(report, 'review', 'formula_source', default={}) or {}
    counts = nested(report, 'review', 'counts', default={}) or {}
    sense_counts = summary.get('dcr_sense_counts') if isinstance(summary.get('dcr_sense_counts'), dict) else {}
    server_eval = nested(report, 'review', 'server_evaluation', default={}) or {}
    schema_missing_paths = missing_audit_paths(report)
    return {
        'grade': grade_code(report),
        'grade_text': nested(report, 'review', 'delivery_quality', 'text', default=''),
        'case_count': int(as_number(summary.get('case_count'))),
        'checks_total': int(as_number(summary.get('checks_total'))),
        'checks_failed': int(as_number(summary.get('checks_failed'))),
        'warnings': int(as_number(summary.get('warnings'))),
        'review_notes': int(as_number(summary.get('review_notes', counts.get('review_notes')))),
        'audit_schema_missing': len(schema_missing_paths),
        'audit_schema_missing_paths': schema_missing_paths,
        'dcr_method': str(summary.get('dcr_method') or nested(review, 'dcr_method', default='legacy_raw_ratio')),
        'dcr_sense_counts': {
            key: int(as_number(sense_counts.get(key)))
            for key in ['max', 'min', 'range', 'info', 'unknown']
        },
        'server_tool_html_match': as_bool(server_eval.get('tool_html_match'), default=False),
        'server_status_not_evaluated': as_bool(nested(report, 'review', 'server_status_not_evaluated', default=False)),
        'server_tool_html': str(server_eval.get('server_tool_html') or nested(report, 'server', 'tool_html', default='')),
        'payload_tool_html': str(server_eval.get('payload_tool_html') or nested(report, 'tool', 'tool_html', default='')),
        'worst_dcr': as_number(nested(summary, 'worst', 'dcr', default=nested(review, 'worst', 'dcr', default=0))),
        'worst_item': nested(summary, 'worst', 'item', default=nested(review, 'worst', 'item', default='')),
        'worst_warning_dcr': as_number(nested(summary, 'worst_warning', 'dcr', default=0)),
        'worst_warning_item': nested(summary, 'worst_warning', 'item', default=''),
        'formula_missing': int(as_number(formula.get('missing'))),
        'formula_total': int(as_number(formula.get('total'))),
        'formula_covered': int(as_number(formula.get('covered'))),
        'app_version': nested(report, 'tool', 'app_version', default=''),
        'template': nested(report, 'tool', 'template', 'key', default=''),
        'generated_at': report.get('generated_at', ''),
        # V2.6.1：governance fingerprint（工具 + 規範合成指紋）
        'governance_fingerprint': str(nested(report, 'trace', 'governance_fingerprint', default='') or ''),
        'calc_source_hash': str(nested(report, 'trace', 'calc_source_hash', default='') or ''),
        'code_profiles_hashes': nested(report, 'trace', 'code_profiles_hashes', default={}) or {},
        # V2.8.0：governance acknowledgment 文字與三方雜湊
        'governance_ack': str(nested(report, 'trace', 'governance_ack', default='') or ''),
        'governance_ack_hash': str(nested(report, 'trace', 'governance_ack_hash', default='') or ''),
        # V3.0.2：StoneGovernanceProtocol 合規檢查（從 trace 區段提取相關 meta）
        'governance_protocol_version': str(nested(report, 'tool', 'governance_protocol_version', default=nested(report, 'trace', 'governance_protocol_version', default='')) or ''),
        # 把整個 trace 收集起來給 validator 用（與 trace 直接同 schema）
        '_governance_meta_for_validation': {
            'governance_protocol_version': nested(report, 'tool', 'governance_protocol_version', default=nested(report, 'trace', 'governance_protocol_version', default='')),
            'input_hash': nested(report, 'trace', 'input_hash', default=''),
            'normalized_input_hash': nested(report, 'trace', 'normalized_input_hash', default=''),
            'result_hash': nested(report, 'trace', 'result_hash', default=''),
            'calc_source_hash': nested(report, 'trace', 'calc_source_hash', default=''),
            'code_profiles_hashes': nested(report, 'trace', 'code_profiles_hashes', default={}) or {},
            'governance_fingerprint': nested(report, 'trace', 'governance_fingerprint', default=''),
            'governance_ack_hash': nested(report, 'trace', 'governance_ack_hash', default=''),
            'governance_ack': nested(report, 'trace', 'governance_ack', default=''),
        },
    }


def trend(new_value: float, old_value: float, lower_is_better: bool = True) -> str:
    if new_value == old_value:
        return 'same'
    improved = new_value < old_value if lower_is_better else new_value > old_value
    return 'improved' if improved else 'worse'


def compare_metrics(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    return {
        'grade': {
            'old': old['grade'],
            'new': new['grade'],
            'trend': trend(GRADE_RANK.get(new['grade'], 3), GRADE_RANK.get(old['grade'], 3)),
        },
        'checks_failed': {
            'old': old['checks_failed'],
            'new': new['checks_failed'],
            'delta': new['checks_failed'] - old['checks_failed'],
            'trend': trend(new['checks_failed'], old['checks_failed']),
        },
        'warnings': {
            'old': old['warnings'],
            'new': new['warnings'],
            'delta': new['warnings'] - old['warnings'],
            'trend': trend(new['warnings'], old['warnings']),
        },
        'worst_dcr': {
            'old': round(old['worst_dcr'], 4),
            'new': round(new['worst_dcr'], 4),
            'delta': round(new['worst_dcr'] - old['worst_dcr'], 4),
            'trend': trend(new['worst_dcr'], old['worst_dcr']),
            'old_item': old.get('worst_item', ''),
            'new_item': new.get('worst_item', ''),
        },
        'worst_warning_dcr': {
            'old': round(old['worst_warning_dcr'], 4),
            'new': round(new['worst_warning_dcr'], 4),
            'delta': round(new['worst_warning_dcr'] - old['worst_warning_dcr'], 4),
            'trend': trend(new['worst_warning_dcr'], old['worst_warning_dcr']),
            'old_item': old.get('worst_warning_item', ''),
            'new_item': new.get('worst_warning_item', ''),
        },
        'dcr_method': {
            'old': old.get('dcr_method', ''),
            'new': new.get('dcr_method', ''),
            'trend': 'same' if old.get('dcr_method') == new.get('dcr_method') else 'worse',
        },
        'server_tool_html_match': {
            'old': old.get('server_tool_html_match', False),
            'new': new.get('server_tool_html_match', False),
            'trend': trend(
                0 if new.get('server_tool_html_match', False) else 1,
                0 if old.get('server_tool_html_match', False) else 1,
            ),
            'old_server_tool_html': old.get('server_tool_html', ''),
            'new_server_tool_html': new.get('server_tool_html', ''),
            'old_payload_tool_html': old.get('payload_tool_html', ''),
            'new_payload_tool_html': new.get('payload_tool_html', ''),
        },
        'server_status_not_evaluated': {
            'old': old.get('server_status_not_evaluated', False),
            'new': new.get('server_status_not_evaluated', False),
            'trend': trend(
                1 if new.get('server_status_not_evaluated', False) else 0,
                1 if old.get('server_status_not_evaluated', False) else 0,
            ),
        },
        'audit_schema_missing': {
            'old': old['audit_schema_missing'],
            'new': new['audit_schema_missing'],
            'delta': new['audit_schema_missing'] - old['audit_schema_missing'],
            'trend': trend(new['audit_schema_missing'], old['audit_schema_missing']),
            'old_paths': old.get('audit_schema_missing_paths', []),
            'new_paths': new.get('audit_schema_missing_paths', []),
        },
        'formula_missing': {
            'old': old['formula_missing'],
            'new': new['formula_missing'],
            'delta': new['formula_missing'] - old['formula_missing'],
            'trend': trend(new['formula_missing'], old['formula_missing']),
        },
        'review_notes': {
            'old': old['review_notes'],
            'new': new['review_notes'],
            'delta': new['review_notes'] - old['review_notes'],
            'trend': trend(new['review_notes'], old['review_notes'], lower_is_better=False),
        },
        # V2.6.1：governance fingerprint 比對 — 工具或規範值任一變動皆會反映於此
        'governance_fingerprint': {
            'old': old.get('governance_fingerprint', ''),
            'new': new.get('governance_fingerprint', ''),
            # changed=True 為治理狀態漂移，需技師檢視原因；trend='same' 不視為品質退步
            'changed': old.get('governance_fingerprint', '') != new.get('governance_fingerprint', ''),
            'old_calc_source_hash': old.get('calc_source_hash', ''),
            'new_calc_source_hash': new.get('calc_source_hash', ''),
            'old_profiles_hashes': old.get('code_profiles_hashes', {}),
            'new_profiles_hashes': new.get('code_profiles_hashes', {}),
        },
        # V2.8.0：governance ack 三方雜湊比對；ack 文字或 profile 任一變 → hash 變
        'governance_ack': {
            'old_text': old.get('governance_ack', ''),
            'new_text': new.get('governance_ack', ''),
            'old_hash': old.get('governance_ack_hash', ''),
            'new_hash': new.get('governance_ack_hash', ''),
            'text_changed': old.get('governance_ack', '') != new.get('governance_ack', ''),
            'hash_changed': old.get('governance_ack_hash', '') != new.get('governance_ack_hash', ''),
        },
        # V3.0.2：protocol 合規檢查
        'protocol': {
            'old_version': old.get('governance_protocol_version', ''),
            'new_version': new.get('governance_protocol_version', ''),
            'version_changed': old.get('governance_protocol_version', '') != new.get('governance_protocol_version', ''),
            'old_validation': validate_governance_meta(old.get('_governance_meta_for_validation') or {}),
            'new_validation': validate_governance_meta(new.get('_governance_meta_for_validation') or {}),
        },
    }


def regression_reasons(diff: dict[str, Any]) -> list[str]:
    checks = {
        'grade': '交付品質分級變差',
        'checks_failed': '未通過檢核數增加',
        'warnings': '警示數增加',
        'worst_dcr': '控制 DCR 增加',
        'formula_missing': '公式來源缺漏增加',
    }
    reasons = []
    for key, label in checks.items():
        if diff.get(key, {}).get('trend') == 'worse':
            reasons.append(label)
    if diff.get('dcr_method', {}).get('trend') == 'worse':
        reasons.append('DCR 正規化方法不一致')
    if diff.get('server_tool_html_match', {}).get('trend') == 'worse':
        reasons.append('工具 HTML 與伺服器不一致')
    if diff.get('server_status_not_evaluated', {}).get('trend') == 'worse':
        reasons.append('伺服器狀態尚未完成稽核評估')
    if diff.get('audit_schema_missing', {}).get('trend') == 'worse':
        reasons.append('稽核報告必要欄位缺漏增加')
    return reasons


def render_text(old_path: Path, new_path: Path, old: dict[str, Any], new: dict[str, Any], diff: dict[str, Any]) -> str:
    lines = [
        'Stone export audit comparison',
        f'OLD: {old_path}',
        f'NEW: {new_path}',
        '',
        f"Quality: {old['grade']} -> {new['grade']} ({diff['grade']['trend']})",
        f"Failed checks: {old['checks_failed']} -> {new['checks_failed']} ({diff['checks_failed']['delta']:+d})",
        f"Warnings: {old['warnings']} -> {new['warnings']} ({diff['warnings']['delta']:+d})",
        f"DCR method: {old['dcr_method']} -> {new['dcr_method']} ({diff['dcr_method']['trend']})",
        f"Server HTML match: {old['server_tool_html_match']} -> {new['server_tool_html_match']} ({diff['server_tool_html_match']['trend']})",
        f"Server status not evaluated: {old['server_status_not_evaluated']} -> {new['server_status_not_evaluated']} ({diff['server_status_not_evaluated']['trend']})",
        f"Audit schema missing: {old['audit_schema_missing']} -> {new['audit_schema_missing']} ({diff['audit_schema_missing']['delta']:+d})",
        f"Worst DCR: {old['worst_dcr']:.4f} -> {new['worst_dcr']:.4f} ({diff['worst_dcr']['delta']:+.4f})",
        f"Worst warning DCR: {old['worst_warning_dcr']:.4f} -> {new['worst_warning_dcr']:.4f} ({diff['worst_warning_dcr']['delta']:+.4f})",
        f"Formula missing: {old['formula_missing']} -> {new['formula_missing']} ({diff['formula_missing']['delta']:+d})",
        f"Review notes: {old['review_notes']} -> {new['review_notes']} ({diff['review_notes']['delta']:+d})",
    ]
    # V2.6.1：governance fingerprint 比對結果（不視為品質退步，但需要技師檢視）
    gov = diff.get('governance_fingerprint', {})
    if gov.get('old') or gov.get('new'):
        gov_old = gov.get('old') or '(none)'
        gov_new = gov.get('new') or '(none)'
        gov_status = '⚠ CHANGED' if gov.get('changed') else '✓ same'
        lines.append(f"Governance fingerprint: {gov_old} -> {gov_new} ({gov_status})")
        if gov.get('changed'):
            old_calc = gov.get('old_calc_source_hash') or '(none)'
            new_calc = gov.get('new_calc_source_hash') or '(none)'
            if old_calc != new_calc:
                lines.append(f"  - calc_source_hash 已變動：{old_calc[:24]}… -> {new_calc[:24]}…")
            old_ph = gov.get('old_profiles_hashes') or {}
            new_ph = gov.get('new_profiles_hashes') or {}
            for scope in sorted(set(list(old_ph.keys()) + list(new_ph.keys()))):
                o = (old_ph.get(scope) or {}).get('hash') if isinstance(old_ph.get(scope), dict) else None
                n = (new_ph.get(scope) or {}).get('hash') if isinstance(new_ph.get(scope), dict) else None
                if o != n:
                    lines.append(f"  - profile[{scope}] 變動：{o or '(none)'} -> {n or '(none)'}")
    # V3.0.2：protocol 合規與版本比對
    proto = diff.get('protocol', {})
    if proto.get('old_version') or proto.get('new_version'):
        ov = proto.get('old_version') or '(none)'
        nv = proto.get('new_version') or '(none)'
        if proto.get('version_changed'):
            lines.append(f"Protocol version: {ov} -> {nv} (⚠ CHANGED)")
        else:
            lines.append(f"Protocol version: {ov}")
        ov_val = proto.get('old_validation') or {}
        nv_val = proto.get('new_validation') or {}
        ov_status = '✓ compliant' if ov_val.get('ok') else f"⚠ 不合規（{len(ov_val.get('errors', []))} 項）"
        nv_status = '✓ compliant' if nv_val.get('ok') else f"⚠ 不合規（{len(nv_val.get('errors', []))} 項）"
        lines.append(f"Protocol compliance: OLD {ov_status} | NEW {nv_status}")
        if not ov_val.get('ok'):
            for err in (ov_val.get('errors') or [])[:3]:
                lines.append(f"  OLD - {err}")
        if not nv_val.get('ok'):
            for err in (nv_val.get('errors') or [])[:3]:
                lines.append(f"  NEW - {err}")

    # V2.8.0：governance ack hash 比對（防偽：ack 文字若被竄改 → hash 變）
    ack = diff.get('governance_ack', {})
    if ack.get('old_hash') or ack.get('new_hash'):
        old_h = ack.get('old_hash') or '(none)'
        new_h = ack.get('new_hash') or '(none)'
        if ack.get('hash_changed'):
            lines.append(f"Governance ack hash: {old_h} -> {new_h} (⚠ CHANGED)")
            if ack.get('text_changed'):
                lines.append('  - ack 文字內容已變動（技師重新編輯或匯出後被竄改？）')
            else:
                lines.append('  - ack 文字未變但 hash 變 → profile 切換或 archive 漂移影響三方雜湊')
        else:
            lines.append(f"Governance ack hash: {old_h} (✓ same)")
    new_missing = diff.get('audit_schema_missing', {}).get('new_paths') or []
    if new_missing:
        lines.extend([
            '',
            'New report missing audit paths:',
            *[f' - {path}' for path in new_missing],
        ])
    return '\n'.join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Compare two stone export audit JSON reports.')
    parser.add_argument('old_report', type=Path, nargs='?')
    parser.add_argument('new_report', type=Path, nargs='?')
    parser.add_argument('--latest', action='store_true', help='compare the latest two *_驗證報告.json files in --dir')
    parser.add_argument('--dir', type=Path, default=DEFAULT_AUDIT_DIR, help='audit report directory used with --latest')
    parser.add_argument('--json', action='store_true', help='print machine-readable comparison JSON')
    parser.add_argument('--fail-on-regression', action='store_true', help='return exit code 2 if quality-critical metrics get worse')
    parser.add_argument('--strict-protocol', action='store_true', help='V3.0.2：return exit code 3 if either report is not StoneGovernanceProtocol-compliant')
    args = parser.parse_args(argv)

    if args.latest:
        old_path, new_path = latest_audit_reports(args.dir.resolve(), 2)
    else:
        if not args.old_report or not args.new_report:
            parser.error('old_report and new_report are required unless --latest is used')
        old_path = args.old_report.resolve()
        new_path = args.new_report.resolve()
    old = extract_metrics(load_audit(old_path))
    new = extract_metrics(load_audit(new_path))
    diff = compare_metrics(old, new)
    regressions = regression_reasons(diff)
    if args.json:
        print(json.dumps({'old': old, 'new': new, 'diff': diff, 'regressions': regressions}, ensure_ascii=False, indent=2))
    else:
        print(render_text(old_path, new_path, old, new, diff))
        if regressions:
            print('\nRegressions:')
            for reason in regressions:
                print(f' - {reason}')
    # V3.0.2：strict-protocol 比 fail-on-regression 優先（exit 3 > exit 2）
    if args.strict_protocol:
        proto = diff.get('protocol', {})
        old_ok = (proto.get('old_validation') or {}).get('ok', False)
        new_ok = (proto.get('new_validation') or {}).get('ok', False)
        if not (old_ok and new_ok):
            return 3
    return 2 if args.fail_on_regression and regressions else 0


if __name__ == '__main__':
    raise SystemExit(main())
