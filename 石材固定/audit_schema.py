# -*- coding: utf-8 -*-
"""Shared schema helpers for stone export audit JSON reports."""
from __future__ import annotations

from typing import Any


REQUIRED_AUDIT_PATHS = [
    ('report_type',),
    ('generated_at',),
    ('server', 'server_version'),
    ('server', 'tool_html'),
    ('tool', 'app_version'),
    ('tool', 'tool_html'),
    ('trace', 'input_hash'),
    ('trace', 'payload_sha256'),
    ('trace', 'result_source'),
    ('summary', 'case_count'),
    ('summary', 'checks_total'),
    ('summary', 'checks_failed'),
    ('summary', 'warnings'),
    ('summary', 'worst', 'dcr'),
    ('summary', 'worst', 'item'),
    ('summary', 'worst_warning', 'dcr'),
    ('summary', 'worst_warning', 'item'),
    ('summary', 'dcr_method'),
    ('summary', 'dcr_sense_counts', 'max'),
    ('summary', 'dcr_sense_counts', 'min'),
    ('summary', 'dcr_sense_counts', 'range'),
    ('review', 'delivery_quality', 'code'),
    ('review', 'formula_source', 'missing'),
    ('review', 'server_status_not_evaluated'),
    ('review', 'server_evaluation', 'tool_html_match'),
    ('review', 'server_evaluation', 'payload_tool_html'),
    ('review', 'server_evaluation', 'server_tool_html'),
    ('output', 'file'),
    ('output', 'size_bytes'),
]


def nested(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    cur: Any = data
    for key in keys:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def missing_audit_paths(report: dict[str, Any]) -> list[str]:
    missing = []
    sentinel = object()
    for path in REQUIRED_AUDIT_PATHS:
        if nested(report, *path, default=sentinel) is sentinel:
            missing.append('.'.join(path))
    return missing
