# -*- coding: utf-8 -*-
"""Check local runtime dependencies used by the stone report tool."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys


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


def playwright_browser_roots() -> list[Path]:
    roots: list[Path] = []
    local_app_data = os.environ.get('LOCALAPPDATA')
    if local_app_data:
        roots.append(Path(local_app_data) / 'ms-playwright')
    roots.append(Path.home() / 'AppData' / 'Local' / 'ms-playwright')
    deduped: list[Path] = []
    for root in roots:
        if root not in deduped:
            deduped.append(root)
    return deduped


def find_playwright_chromium_executable() -> Path | None:
    patterns = [
        'chromium-*/*/chrome.exe',
        'chromium_headless_shell-*/*/headless_shell.exe',
    ]
    for root in playwright_browser_roots():
        if not root.exists():
            continue
        for pattern in patterns:
            matches = sorted(root.glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True)
            if matches:
                return matches[0]
    return None


def check_playwright_chromium() -> str:
    version = run_version([sys.executable, '-m', 'playwright', '--version'])
    if not version:
        raise RuntimeError('Playwright CLI did not report a version')
    executable = find_playwright_chromium_executable()
    if executable is None:
        searched = ', '.join(str(root) for root in playwright_browser_roots())
        raise RuntimeError(f'Chromium executable not found under: {searched}')
    return f'{version}; browser={executable}'


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
            detail = check_playwright_chromium()
            print(f' - playwright chromium: available ({detail})')
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