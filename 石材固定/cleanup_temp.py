# -*- coding: utf-8 -*-
"""Safely list or remove known temporary files created while testing this tool."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent

TEMP_FILE_PATTERNS = [
    '_tmp_stone_report*.json',
    '_tmp_stone_report*.docx',
    '.tmp-spec-inline.js',
    'tmp-spec-inline*.js',
    'server-test.log',
    'server-test.err',
    'plot.log',
    'sshot-*.jpg',
    'stone_report_test*.json',
    'stone_report_test*.docx',
]

TEMP_DIR_PATTERNS = [
    '__pycache__',
    '.playwright-cli',
    'test-results',
    'tmp',
    '_tmp_spec*',
]


def candidates() -> list[Path]:
    items: dict[Path, Path] = {}
    for pattern in TEMP_FILE_PATTERNS:
        for path in ROOT.glob(pattern):
            if path.is_file():
                items[path.resolve()] = path
    for pattern in TEMP_DIR_PATTERNS:
        for path in ROOT.glob(pattern):
            if path.is_dir():
                items[path.resolve()] = path
    return sorted(items.values(), key=lambda p: p.name.lower())


def format_size(path: Path) -> str:
    if path.is_dir():
        total = sum(item.stat().st_size for item in path.rglob('*') if item.is_file())
    else:
        total = path.stat().st_size
    if total >= 1024 * 1024:
        return f'{total / 1024 / 1024:.1f} MB'
    if total >= 1024:
        return f'{total / 1024:.1f} KB'
    return f'{total} B'


def remove_path(path: Path) -> None:
    resolved = path.resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError as exc:
        raise RuntimeError(f'Refusing to remove path outside workspace: {path}') from exc
    if resolved == ROOT.resolve():
        raise RuntimeError(f'Refusing to remove workspace root: {path}')

    if resolved.is_dir():
        shutil.rmtree(resolved)
    else:
        resolved.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description='List or remove known temporary files.')
    parser.add_argument('--apply', action='store_true', help='Actually remove files. Default is dry-run.')
    parser.add_argument('--yes', action='store_true', help='Skip the confirmation prompt when used with --apply.')
    args = parser.parse_args()

    found = candidates()
    if not found:
        print('No known temporary files found.')
        return 0

    print('Known temporary files:')
    for path in found:
        kind = 'dir ' if path.is_dir() else 'file'
        print(f' - [{kind}] {path.name} ({format_size(path)})')

    if not args.apply:
        print('\nDry run only. Re-run with --apply to remove these files.')
        return 0

    if not args.yes:
        answer = input('\nRemove these temporary files? Type YES to continue: ').strip()
        if answer != 'YES':
            print('Cancelled.')
            return 1

    for path in found:
        remove_path(path)
    print(f'Removed {len(found)} temporary item(s).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
