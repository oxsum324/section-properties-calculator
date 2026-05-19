# -*- coding: utf-8 -*-
"""Run the noninteractive pre-delivery gate for the stone report tool."""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from self_check import PY_COMPILE_REQUIRED


ROOT = Path(__file__).resolve().parent
AUDIT_DIR = ROOT / 'output'


def run_step(label: str, command: list[str]) -> int:
    print(f'\n[{label}]', flush=True)
    print(' '.join(command), flush=True)
    proc = subprocess.run(command, cwd=ROOT, check=False)
    if proc.returncode != 0:
        print(f'[FAIL] {label} exited with code {proc.returncode}', flush=True)
    return proc.returncode


def audit_report_count() -> int:
    if not AUDIT_DIR.is_dir():
        return 0
    return len([path for path in AUDIT_DIR.glob('*_驗證報告.json') if path.is_file()])


def run_latest_audit_gate() -> int:
    count = audit_report_count()
    if count < 2:
        print(f'\n[Audit regression gate]', flush=True)
        print(f'[SKIP] Need at least 2 audit reports in output, found {count}.', flush=True)
        return 0
    return run_step(
        'Audit regression gate',
        [sys.executable, 'audit_compare.py', '--latest', '--fail-on-regression'],
    )


def run_release_bundle_gate() -> int:
    code = run_step('Release bundle dry-run', [sys.executable, 'make_release_bundle.py'])
    if code != 0:
        return code

    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / 'pre_delivery_bundle.zip'
        code = run_step(
            'Create temporary release ZIP',
            [sys.executable, 'make_release_bundle.py', '--apply', '--output', str(out_path)],
        )
        if code != 0:
            return code
        return run_step(
            'Verify temporary release ZIP',
            [sys.executable, 'verify_release_bundle.py', str(out_path)],
        )


def run_tool_self_check() -> int:
    steps = [
        ('Environment dependencies', [sys.executable, 'env_check.py']),
        ('Project version and path consistency', [sys.executable, 'self_check.py']),
        ('Regression test syntax', ['node', '--check', 'js\\regression-smoke.test.js']),
        ('Calculator regression smoke tests', ['node', 'js\\regression-smoke.test.js']),
        ('Formula registry syntax', ['node', '--check', 'js\\formula-registry.spec.js']),
        ('Formula registry smoke syntax', ['node', '--check', 'js\\formula-registry-smoke.test.js']),
        ('Version sync syntax', ['node', '--check', 'js\\version-sync.js']),
        ('Version sync smoke syntax', ['node', '--check', 'js\\version-sync-smoke.test.js']),
        ('Version sync smoke tests', ['node', 'js\\version-sync-smoke.test.js']),
        ('Review dashboard helper syntax', ['node', '--check', 'js\\review-dashboard.js']),
        ('Review dashboard smoke syntax', ['node', '--check', 'js\\review-dashboard-smoke.test.js']),
        ('Review dashboard smoke tests', ['node', 'js\\review-dashboard-smoke.test.js']),
        ('Formula registry smoke tests', ['node', 'js\\formula-registry-smoke.test.js']),
        ('Server export smoke tests', [sys.executable, 'server_smoke_test.py']),
        ('Audit schema smoke tests', [sys.executable, 'audit_schema_test.py']),
        ('Audit comparison smoke tests', [sys.executable, 'audit_compare_test.py']),
        ('Cleanup smoke tests', [sys.executable, 'cleanup_temp_test.py']),
        ('Release bundle smoke tests', [sys.executable, 'release_bundle_smoke_test.py']),
        ('UI smoke test', [sys.executable, 'ui_smoke_test.py']),
        ('Frontend calculator syntax', ['node', '--check', 'js\\calculator.spec.js']),
        ('Frontend constants syntax', ['node', '--check', 'js\\constants.spec.js']),
        ('Python backend syntax', [sys.executable, '-m', 'py_compile', *PY_COMPILE_REQUIRED]),
    ]
    for label, command in steps:
        code = run_step(label, command)
        if code != 0:
            return code
    return 0


def main() -> int:
    steps = [
        ('Tool self-check', run_tool_self_check),
        ('Audit regression gate', run_latest_audit_gate),
        ('Release bundle gate', run_release_bundle_gate),
    ]
    for label, step in steps:
        code = step()
        if code != 0:
            print(f'\nPre-delivery check failed at: {label}', flush=True)
            return code

    print('\nPre-delivery check passed.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
