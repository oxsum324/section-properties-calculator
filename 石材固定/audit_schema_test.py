# -*- coding: utf-8 -*-
"""Smoke tests for shared audit schema helpers."""
from __future__ import annotations

import unittest

import audit_schema
import server


def complete_report() -> dict:
    return {
        'report_type': 'stone_calc_export_audit',
        'generated_at': '2026-04-25T00:00:00+0800',
        'server': {
            'server_version': server.SERVER_VERSION,
            'tool_html': '石材計算書產生器_規範版V2.html',
        },
        'tool': {
            'app_version': f'V{server.SERVER_VERSION}',
            'tool_html': '石材計算書產生器_規範版V2.html',
        },
        'trace': {
            'input_hash': 'abc123',
            'payload_sha256': '0123456789abcdef0123456789abcdef',
            'result_source': 'frontend_results',
        },
        'summary': {
            'case_count': 1,
            'checks_total': 3,
            'checks_failed': 1,
            'warnings': 1,
            'worst': {'dcr': 1.8423, 'item': '插銷剪力'},
            'worst_warning': {'dcr': 0.4167, 'item': '孔位提醒'},
            'dcr_method': 'normalized_by_check_sense',
            'dcr_sense_counts': {'max': 1, 'min': 2, 'range': 0},
        },
        'review': {
            'delivery_quality': {'code': 'C'},
            'formula_source': {'missing': 0},
            'server_status_not_evaluated': False,
            'server_evaluation': {
                'tool_html_match': True,
                'payload_tool_html': '石材計算書產生器_規範版V2.html',
                'server_tool_html': '石材計算書產生器_規範版V2.html',
            },
        },
        'output': {
            'file': 'smoke.docx',
            'size_bytes': 10,
        },
    }


class AuditSchemaTests(unittest.TestCase):
    def test_complete_report_has_no_missing_paths(self) -> None:
        self.assertEqual(audit_schema.missing_audit_paths(complete_report()), [])

    def test_missing_nested_paths_are_reported(self) -> None:
        report = complete_report()
        del report['summary']['dcr_method']
        del report['review']['server_evaluation']['tool_html_match']

        missing = audit_schema.missing_audit_paths(report)
        self.assertIn('summary.dcr_method', missing)
        self.assertIn('review.server_evaluation.tool_html_match', missing)

    def test_nested_returns_default_when_path_is_absent(self) -> None:
        report = complete_report()
        self.assertEqual(audit_schema.nested(report, 'summary', 'worst', 'item'), '插銷剪力')
        self.assertEqual(audit_schema.nested(report, 'summary', 'missing', default='fallback'), 'fallback')


if __name__ == '__main__':
    unittest.main()
