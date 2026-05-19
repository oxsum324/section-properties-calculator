# -*- coding: utf-8 -*-
"""Check local runtime dependencies used by the stone report tool."""
from __future__ import annotations

import importlib.util
import shutil
import subprocess


COMMANDS = [
    ('python', ['python', '--version']),
    ('node', ['node', '--version']),
]

PYTHON_MODULES = [
    ('docx', 'python-docx', 'legacy DOCX generator'),
    ('lxml', 'lxml', 'legacy DOCX generator XML helpers'),
    ('pdf2docx', 'pdf2docx', 'PDF to DOCX conversion'),
    ('playwright', 'playwright', 'auto Word Chromium rendering'),
]


def run_version(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return (proc.stdout or '').strip()


def main() -> int:
    errors: list[str] = []

    print('Environment dependency check:')
    for label, cmd in COMMANDS:
        exe = shutil.which(cmd[0])
        if not exe:
            errors.append(f'Missing command: {label}')
            print(f' - {label}: MISSING')
            continue
        version = run_version(cmd)
        print(f' - {label}: {version or exe}')

    for module, package, purpose in PYTHON_MODULES:
        if importlib.util.find_spec(module) is None:
            errors.append(f'Missing Python package: {package} ({purpose})')
            print(f' - {package}: MISSING ({purpose})')
        else:
            print(f' - {package}: ok ({purpose})')

    if importlib.util.find_spec('playwright') is not None:
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as pw:
                print(f' - playwright chromium: available ({pw.chromium.name})')
        except Exception as exc:
            errors.append(f'Playwright is installed but Chromium is not ready: {exc}')
            print(f' - playwright chromium: NOT READY ({exc})')

    if errors:
        print('\nEnvironment check failed:')
        for error in errors:
            print(f' - {error}')
        print('\nSuggested install commands:')
        print(' - pip install python-docx lxml pdf2docx playwright')
        print(' - python -m playwright install chromium')
        return 1

    print('Environment dependency check passed.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
