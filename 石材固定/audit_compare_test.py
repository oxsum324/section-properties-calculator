# -*- coding: utf-8 -*-
"""Smoke tests for audit_compare.py."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

import audit_compare
import server


def audit_report(
    *,
    grade: str,
    failed: int,
    warnings: int,
    dcr: float,
    missing: int,
    notes: int,
    dcr_method: str = 'normalized_by_check_sense',
    warning_dcr: float = 0.0,
    server_match: bool = True,
    server_not_evaluated: bool = False,
    governance_fingerprint: str = '',
    calc_source_hash: str = '',
    code_profiles_hashes: dict | None = None,
    governance_ack: str = '',
    governance_ack_hash: str = '',
    governance_protocol_version: str = '',
    input_hash: str = '',
    normalized_input_hash: str = '',
    result_hash: str = '',
) -> dict:
    return {
        'ok': True,
        'report_type': 'stone_calc_export_audit',
        'generated_at': '2026-04-25T00:00:00+0800',
        'tool': {
            'app_version': f'V{server.SERVER_VERSION}',
            'tool_html': '石材計算書產生器_規範版V2.html' if server_match else '石材計算書產生器_規範版.html',
            'template': {'key': 'pk_4h_t30'},
        },
        'server': {
            'server_version': server.SERVER_VERSION,
            'tool_html': '石材計算書產生器_規範版V2.html',
        },
        'trace': {
            'input_hash': input_hash or 'abc123',
            'normalized_input_hash': normalized_input_hash,
            'result_hash': result_hash,
            'payload_sha256': '0123456789abcdef0123456789abcdef',
            'result_source': 'frontend_results',
            'governance_protocol_version': governance_protocol_version,
            'governance_fingerprint': governance_fingerprint,
            'calc_source_hash': calc_source_hash,
            'code_profiles_hashes': code_profiles_hashes or {},
            'governance_ack': governance_ack,
            'governance_ack_hash': governance_ack_hash,
        },
        'summary': {
            'case_count': 1,
            'checks_total': 3,
            'checks_failed': failed,
            'warnings': warnings,
            'review_notes': notes,
            'dcr_method': dcr_method,
            'dcr_sense_counts': {'max': 1, 'min': 1, 'range': 1, 'info': 0, 'unknown': 0},
            'worst': {'dcr': dcr, 'case_name': '標準板', 'item': '插銷剪力'},
            'worst_warning': {'dcr': warning_dcr, 'case_name': '標準板', 'item': '孔位提醒'},
        },
        'review': {
            'delivery_quality': {'code': grade, 'text': f'{grade} quality'},
            'formula_source': {
                'version': 'formula-registry-2026.04.25',
                'total': 3,
                'covered': 3 - missing,
                'missing': missing,
            },
            'counts': {'review_notes': notes},
            'server_status_not_evaluated': server_not_evaluated,
            'server_evaluation': {
                'tool_html_match': server_match,
                'payload_tool_html': '石材計算書產生器_規範版V2.html' if server_match else '石材計算書產生器_規範版.html',
                'server_tool_html': '石材計算書產生器_規範版V2.html',
            },
        },
        'output': {
            'file': 'smoke.docx',
            'size_bytes': 10,
        },
    }


class AuditCompareTests(unittest.TestCase):
    def test_compare_metrics_detects_improvement(self) -> None:
        old = audit_compare.extract_metrics(audit_report(grade='C', failed=2, warnings=3, dcr=1.25, missing=1, notes=0))
        new = audit_compare.extract_metrics(audit_report(grade='A', failed=0, warnings=0, dcr=0.72, missing=0, notes=2))
        diff = audit_compare.compare_metrics(old, new)

        self.assertEqual(diff['grade']['trend'], 'improved')
        self.assertEqual(diff['checks_failed']['delta'], -2)
        self.assertEqual(diff['formula_missing']['trend'], 'improved')
        self.assertEqual(diff['review_notes']['trend'], 'improved')
        self.assertEqual(diff['dcr_method']['trend'], 'same')
        self.assertEqual(diff['server_tool_html_match']['trend'], 'same')
        self.assertEqual(diff['server_status_not_evaluated']['trend'], 'same')
        self.assertEqual(diff['audit_schema_missing']['trend'], 'same')
        self.assertEqual(new['audit_schema_missing'], 0)
        self.assertEqual(new['dcr_sense_counts']['range'], 1)
        self.assertEqual(audit_compare.regression_reasons(diff), [])

    def test_v261_governance_fingerprint_same(self) -> None:
        # V2.6.1：兩份 audit 同 governance fingerprint → diff.changed=False，不視為退步
        gov = 'gov:17a81de1da0c4f'
        ph = {'seismic': {'id': 'cns_seismic_113', 'hash': 'cyrb53:abc'}}
        old = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_fingerprint=gov, calc_source_hash='sha256:aaa', code_profiles_hashes=ph))
        new = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_fingerprint=gov, calc_source_hash='sha256:aaa', code_profiles_hashes=ph))
        diff = audit_compare.compare_metrics(old, new)
        self.assertEqual(diff['governance_fingerprint']['old'], gov)
        self.assertEqual(diff['governance_fingerprint']['new'], gov)
        self.assertFalse(diff['governance_fingerprint']['changed'])
        # 同 fingerprint 不應觸發 regression（治理一致）
        self.assertEqual(audit_compare.regression_reasons(diff), [])

    def test_v280_governance_ack_hash_same(self) -> None:
        # V2.8.0：相同 ack 文字 + 相同治理狀態 → ack_hash 一致 → text_changed=False, hash_changed=False
        ack_text = '本案採對照 profile，工程判斷如後...'
        ack_hash = 'ack:abcdef0123456789'
        old = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_ack=ack_text, governance_ack_hash=ack_hash))
        new = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_ack=ack_text, governance_ack_hash=ack_hash))
        diff = audit_compare.compare_metrics(old, new)
        self.assertFalse(diff['governance_ack']['text_changed'])
        self.assertFalse(diff['governance_ack']['hash_changed'])

    def test_v302_validate_governance_meta_compliant(self) -> None:
        # V3.0.2：合規 meta 通過驗證
        meta = {
            'governance_protocol_version': '1.0.0',
            'input_hash': 'sha256:' + 'a' * 64,
            'normalized_input_hash': 'sha256:' + 'b' * 64,
            'result_hash': 'sha256:' + 'c' * 64,
            'calc_source_hash': 'sha256:' + 'd' * 64,
            'code_profiles_hashes': {'wind': {'id': 'cns_wind_107', 'hash': 'cyrb53:' + 'e' * 14}},
            'governance_fingerprint': 'gov:' + 'f' * 14,
            'governance_ack_hash': 'ack:' + '1' * 14,
        }
        r = audit_compare.validate_governance_meta(meta)
        self.assertTrue(r['ok'], f'應合規，errors: {r["errors"]}')
        self.assertEqual(r['version'], '1.0.0')

    def test_v302_validate_governance_meta_unsupported_version(self) -> None:
        # V3.0.2：不支援 protocol version 報錯
        r = audit_compare.validate_governance_meta({'governance_protocol_version': '2.0.0'})
        self.assertFalse(r['ok'])
        self.assertTrue(any('不支援的 protocol version' in e for e in r['errors']))

    def test_v302_validate_governance_meta_logical_inconsistency(self) -> None:
        # V3.0.2：fingerprint 存在但 calc_source_hash 為空 → 違反 spec § 5.2
        r = audit_compare.validate_governance_meta({
            'governance_protocol_version': '1.0.0',
            'governance_fingerprint': 'gov:' + 'a' * 14,
            'code_profiles_hashes': {},
        })
        self.assertFalse(r['ok'])
        self.assertTrue(any('違反 spec § 5.2' in e for e in r['errors']))

    def test_v302_strict_protocol_returns_3(self) -> None:
        # V3.0.2：--strict-protocol：任一報告不合規 → exit 3
        with tempfile.TemporaryDirectory() as tmp:
            old_path = Path(tmp) / 'old.json'
            new_path = Path(tmp) / 'new.json'
            # 兩份報告皆不合規（缺 governance_protocol_version）
            old_path.write_text(json.dumps(audit_report(grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0)), encoding='utf-8')
            new_path.write_text(json.dumps(audit_report(grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0)), encoding='utf-8')
            with redirect_stdout(StringIO()):
                rc = audit_compare.main([str(old_path), str(new_path), '--json', '--strict-protocol'])
            self.assertEqual(rc, 3, '不合規應 exit 3')

    def test_v302_strict_protocol_passes_when_compliant(self) -> None:
        # V3.0.2：兩份都合規時 --strict-protocol 應 exit 0
        with tempfile.TemporaryDirectory() as tmp:
            old_path = Path(tmp) / 'old.json'
            new_path = Path(tmp) / 'new.json'
            kw = dict(
                governance_protocol_version='1.0.0',
                calc_source_hash='sha256:' + 'd' * 64,
                governance_fingerprint='gov:' + 'f' * 14,
                code_profiles_hashes={'wind': {'id': 'cns_wind_107', 'hash': 'cyrb53:' + 'e' * 14}},
                input_hash='sha256:' + 'a' * 64,
                normalized_input_hash='sha256:' + 'b' * 64,
                result_hash='sha256:' + 'c' * 64,
            )
            old_path.write_text(json.dumps(audit_report(grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0, **kw)), encoding='utf-8')
            new_path.write_text(json.dumps(audit_report(grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0, **kw)), encoding='utf-8')
            with redirect_stdout(StringIO()):
                rc = audit_compare.main([str(old_path), str(new_path), '--strict-protocol'])
            self.assertEqual(rc, 0)

    def test_v302_render_text_shows_compliance(self) -> None:
        # V3.0.2：render_text 顯示 protocol 版本與合規狀態
        kw = dict(
            governance_protocol_version='1.0.0',
            calc_source_hash='sha256:' + 'd' * 64,
            governance_fingerprint='gov:' + 'f' * 14,
            code_profiles_hashes={'wind': {'id': 'cns_wind_107', 'hash': 'cyrb53:' + 'e' * 14}},
            input_hash='sha256:' + 'a' * 64,
            normalized_input_hash='sha256:' + 'b' * 64,
            result_hash='sha256:' + 'c' * 64,
        )
        old = audit_compare.extract_metrics(audit_report(grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0, **kw))
        new = audit_compare.extract_metrics(audit_report(grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0, **kw))
        diff = audit_compare.compare_metrics(old, new)
        text = audit_compare.render_text(Path('old.json'), Path('new.json'), old, new, diff)
        self.assertIn('Protocol version', text)
        self.assertIn('1.0.0', text)
        self.assertIn('compliant', text)

    def test_v280_governance_ack_text_tampered(self) -> None:
        # V2.8.0：ack 文字被竄改 → text_changed=True, hash_changed=True
        old = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_ack='原本理由 A', governance_ack_hash='ack:111111111111aa'))
        new = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_ack='被竄改的理由 B', governance_ack_hash='ack:222222222222bb'))
        diff = audit_compare.compare_metrics(old, new)
        self.assertTrue(diff['governance_ack']['text_changed'])
        self.assertTrue(diff['governance_ack']['hash_changed'])
        text = audit_compare.render_text(Path('old.json'), Path('new.json'), old, new, diff)
        self.assertIn('Governance ack hash', text)
        self.assertIn('CHANGED', text)
        self.assertIn('ack 文字內容已變動', text)

    def test_v261_governance_fingerprint_changed(self) -> None:
        # V2.6.1：兩份 audit 不同 governance fingerprint → diff.changed=True，render_text 含「CHANGED」與細節
        old = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_fingerprint='gov:aaaaaaaaaaaaaa',
            calc_source_hash='sha256:111',
            code_profiles_hashes={'seismic': {'id': 'cns_seismic_113', 'hash': 'cyrb53:old'}}))
        new = audit_compare.extract_metrics(audit_report(
            grade='A', failed=0, warnings=0, dcr=0.7, missing=0, notes=0,
            governance_fingerprint='gov:bbbbbbbbbbbbbb',
            calc_source_hash='sha256:222',
            code_profiles_hashes={'seismic': {'id': 'cns_seismic_113', 'hash': 'cyrb53:new'}}))
        diff = audit_compare.compare_metrics(old, new)
        self.assertTrue(diff['governance_fingerprint']['changed'])
        text = audit_compare.render_text(Path('old.json'), Path('new.json'), old, new, diff)
        self.assertIn('Governance fingerprint', text)
        self.assertIn('CHANGED', text)
        self.assertIn('calc_source_hash 已變動', text)
        self.assertIn('profile[seismic] 變動', text)

    def test_cli_json_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            old_path = Path(tmp) / 'old.json'
            new_path = Path(tmp) / 'new.json'
            old_path.write_text(json.dumps(audit_report(grade='B', failed=0, warnings=1, dcr=0.91, missing=0, notes=1), ensure_ascii=False), encoding='utf-8')
            new_path.write_text(json.dumps(audit_report(grade='A', failed=0, warnings=0, dcr=0.70, missing=0, notes=1), ensure_ascii=False), encoding='utf-8')

            out = StringIO()
            with redirect_stdout(out):
                self.assertEqual(audit_compare.main([str(old_path), str(new_path), '--json']), 0)
            data = json.loads(out.getvalue())
            self.assertEqual(data['diff']['grade']['trend'], 'improved')
            self.assertEqual(data['old']['dcr_method'], 'normalized_by_check_sense')
            self.assertTrue(data['new']['server_tool_html_match'])
            self.assertFalse(data['new']['server_status_not_evaluated'])
            self.assertEqual(data['new']['audit_schema_missing'], 0)
            self.assertIn('worst_warning_dcr', data['new'])
            self.assertEqual(data['regressions'], [])

    def test_fail_on_regression_returns_nonzero(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            old_path = Path(tmp) / 'old.json'
            new_path = Path(tmp) / 'new.json'
            old_path.write_text(json.dumps(audit_report(grade='A', failed=0, warnings=0, dcr=0.70, missing=0, notes=1), ensure_ascii=False), encoding='utf-8')
            new_path.write_text(json.dumps(audit_report(grade='C', failed=1, warnings=2, dcr=1.20, missing=1, notes=1), ensure_ascii=False), encoding='utf-8')

            out = StringIO()
            with redirect_stdout(out):
                code = audit_compare.main([str(old_path), str(new_path), '--fail-on-regression'])
            self.assertEqual(code, 2)
            self.assertIn('Regressions:', out.getvalue())

    def test_latest_mode_uses_newest_two_reports(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            older = base / 'oldest_驗證報告.json'
            old_path = base / 'old_驗證報告.json'
            new_path = base / 'new_驗證報告.json'
            older.write_text(json.dumps(audit_report(grade='C', failed=2, warnings=2, dcr=1.40, missing=1, notes=0), ensure_ascii=False), encoding='utf-8')
            old_path.write_text(json.dumps(audit_report(grade='B', failed=0, warnings=1, dcr=0.91, missing=0, notes=1), ensure_ascii=False), encoding='utf-8')
            new_path.write_text(json.dumps(audit_report(grade='A', failed=0, warnings=0, dcr=0.70, missing=0, notes=1), ensure_ascii=False), encoding='utf-8')
            os.utime(older, (1000, 1000))
            os.utime(old_path, (2000, 2000))
            os.utime(new_path, (3000, 3000))

            latest = audit_compare.latest_audit_reports(base)
            self.assertEqual([p.name for p in latest], ['old_驗證報告.json', 'new_驗證報告.json'])

            out = StringIO()
            with redirect_stdout(out):
                self.assertEqual(audit_compare.main(['--latest', '--dir', str(base), '--json']), 0)
            data = json.loads(out.getvalue())
            self.assertEqual(data['old']['grade'], 'B')
            self.assertEqual(data['new']['grade'], 'A')

    def test_dcr_method_change_is_regression(self) -> None:
        old = audit_compare.extract_metrics(audit_report(
            grade='A',
            failed=0,
            warnings=0,
            dcr=0.70,
            missing=0,
            notes=1,
            dcr_method='normalized_by_check_sense',
        ))
        new = audit_compare.extract_metrics(audit_report(
            grade='A',
            failed=0,
            warnings=0,
            dcr=0.70,
            missing=0,
            notes=1,
            dcr_method='legacy_raw_ratio',
        ))
        diff = audit_compare.compare_metrics(old, new)
        self.assertEqual(diff['dcr_method']['trend'], 'worse')
        self.assertIn('DCR 正規化方法不一致', audit_compare.regression_reasons(diff))

    def test_server_html_mismatch_is_regression(self) -> None:
        old = audit_compare.extract_metrics(audit_report(
            grade='A',
            failed=0,
            warnings=0,
            dcr=0.70,
            missing=0,
            notes=1,
            server_match=True,
        ))
        new = audit_compare.extract_metrics(audit_report(
            grade='C',
            failed=0,
            warnings=0,
            dcr=0.70,
            missing=0,
            notes=1,
            server_match=False,
        ))
        diff = audit_compare.compare_metrics(old, new)
        self.assertEqual(diff['server_tool_html_match']['trend'], 'worse')
        self.assertIn('工具 HTML 與伺服器不一致', audit_compare.regression_reasons(diff))

    def test_server_status_not_evaluated_is_regression(self) -> None:
        old = audit_compare.extract_metrics(audit_report(
            grade='A',
            failed=0,
            warnings=0,
            dcr=0.70,
            missing=0,
            notes=1,
            server_not_evaluated=False,
        ))
        new = audit_compare.extract_metrics(audit_report(
            grade='B',
            failed=0,
            warnings=0,
            dcr=0.70,
            missing=0,
            notes=1,
            server_not_evaluated=True,
        ))
        diff = audit_compare.compare_metrics(old, new)
        self.assertEqual(diff['server_status_not_evaluated']['trend'], 'worse')
        self.assertIn('伺服器狀態尚未完成稽核評估', audit_compare.regression_reasons(diff))

    def test_audit_schema_missing_increase_is_regression(self) -> None:
        old_report = audit_report(grade='A', failed=0, warnings=0, dcr=0.70, missing=0, notes=1)
        new_report = audit_report(grade='A', failed=0, warnings=0, dcr=0.70, missing=0, notes=1)
        del new_report['summary']['dcr_method']
        del new_report['review']['server_evaluation']

        old = audit_compare.extract_metrics(old_report)
        new = audit_compare.extract_metrics(new_report)
        diff = audit_compare.compare_metrics(old, new)

        self.assertGreater(new['audit_schema_missing'], old['audit_schema_missing'])
        self.assertEqual(diff['audit_schema_missing']['trend'], 'worse')
        self.assertIn('稽核報告必要欄位缺漏增加', audit_compare.regression_reasons(diff))

    def test_text_output_lists_missing_audit_paths(self) -> None:
        old_report = audit_report(grade='A', failed=0, warnings=0, dcr=0.70, missing=0, notes=1)
        new_report = audit_report(grade='A', failed=0, warnings=0, dcr=0.70, missing=0, notes=1)
        del new_report['summary']['dcr_method']
        del new_report['review']['server_evaluation']

        old = audit_compare.extract_metrics(old_report)
        new = audit_compare.extract_metrics(new_report)
        diff = audit_compare.compare_metrics(old, new)
        text = audit_compare.render_text(Path('old.json'), Path('new.json'), old, new, diff)

        self.assertIn('New report missing audit paths:', text)
        self.assertIn('summary.dcr_method', text)
        self.assertIn('review.server_evaluation.tool_html_match', text)


if __name__ == '__main__':
    unittest.main()
