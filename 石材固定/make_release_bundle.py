# -*- coding: utf-8 -*-
"""Create a portable handoff/archive ZIP for the stone report tool."""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import time
import zipfile
from pathlib import Path

import cleanup_temp
import server


ROOT = Path(__file__).resolve().parent

CORE_FILES = [
    '.gitignore',
    'README.md',
    'CHANGELOG.md',
    'RELEASE_CHECKLIST.md',
    'PROJECT_FILES.md',
    '石材計算書產生器_規範版V2.html',
    'server.py',
    'auto_word.py',
    'generate_docx.py',
    'verifier.py',
    'pdf_to_docx.py',
    'env_check.py',
    'self_check.py',
    'server_smoke_test.py',
    'ui_smoke_test.py',
    'audit_schema.py',
    'audit_schema_test.py',
    'audit_compare.py',
    'audit_compare_test.py',
    'cleanup_temp.py',
    'cleanup_temp_test.py',
    'make_release_bundle.py',
    'release_bundle_smoke_test.py',
    'verify_release_bundle.py',
    'pre_delivery_check.py',
    '開啟石材計算書.bat',
    '啟動伺服器.bat',
    '自我檢查.bat',
    '比對稽核報告.bat',
    '清理暫存檔.bat',
    '建立交接包.bat',
    '交付前檢查.bat',
    '註冊快速啟動.reg',
    'paged.polyfill.js',
    'docx-9.6.1.tgz',
    'vendor/package/LICENSE',
    'vendor/package/README.md',
    'vendor/package/package.json',
    'vendor/package/dist/index.iife.js',
]

CORE_DIRS = [
    'js',
    'vendor/katex',
    'vendor/loads',
    'vendor/pdfjs',
]

BUNDLE_EXCLUDE_PATTERNS = [
    '__pycache__',
    '*.pyc',
    '*.pyo',
    'node_modules',
    '.playwright-cli',
    'test-results',
    'tmp',
    '_tmp_spec*',
    'output',
    'release',
    *cleanup_temp.TEMP_FILE_PATTERNS,
    *cleanup_temp.TEMP_DIR_PATTERNS,
    '*_驗證報告.json',
]

OPTIONAL_REFERENCE_FILES = [
    '01_背扣雙角鐵.jpg',
    '02_插銷鐵件.jpg',
    '02套管式膨脹螺栓.jpg',
    '02鎚釘式膨脹螺栓.png',
    '石材安裝施工規範.pdf',
    '建築物外牆石材施工規範研擬.pdf',
    '石材固定檢覈V1.101.xls',
    '完整計算書範例.doc',
    '簡化計算書(範例).pdf',
    'stone_report (5).json',
]

OPTIONAL_LEGACY_FILES = [
    '石材計算書產生器.html',
    '石材計算書產生器_直接Word版.html',
    '石材計算書產生器_規範版.html',
    '生成Word報告.bat',
    'PDF轉Word.bat',
]


def is_bundle_excluded(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    names = rel.parts
    for part in names:
        if any(fnmatch.fnmatch(part, pattern) for pattern in BUNDLE_EXCLUDE_PATTERNS):
            return True
    return any(fnmatch.fnmatch(rel.as_posix(), pattern) for pattern in BUNDLE_EXCLUDE_PATTERNS)


def existing_files(include_reference: bool = False, include_legacy: bool = False) -> list[Path]:
    paths: list[Path] = []
    file_names = list(CORE_FILES)
    if include_reference:
        file_names.extend(OPTIONAL_REFERENCE_FILES)
    if include_legacy:
        file_names.extend(OPTIONAL_LEGACY_FILES)

    for name in file_names:
        path = ROOT / name
        if path.is_file():
            paths.append(path)

    for dirname in CORE_DIRS:
        base = ROOT / dirname
        if not base.is_dir():
            continue
        for path in sorted(base.rglob('*')):
            if path.is_file() and not is_bundle_excluded(path):
                paths.append(path)

    return sorted(dict.fromkeys(paths), key=lambda p: str(p.relative_to(ROOT)).lower())


def default_output_name(include_reference: bool, include_legacy: bool) -> Path:
    stamp = time.strftime('%Y%m%d_%H%M%S')
    flavor = 'core'
    if include_reference and include_legacy:
        flavor = 'full'
    elif include_reference:
        flavor = 'with_refs'
    elif include_legacy:
        flavor = 'with_legacy'
    return ROOT / 'release' / f'stone_tool_V{server.SERVER_VERSION}_{flavor}_{stamp}.zip'


def format_size(path: Path) -> str:
    size = path.stat().st_size
    if size >= 1024 * 1024:
        return f'{size / 1024 / 1024:.1f} MB'
    if size >= 1024:
        return f'{size / 1024:.1f} KB'
    return f'{size} B'


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(paths: list[Path], include_reference: bool, include_legacy: bool, output: Path) -> dict:
    files = []
    for path in paths:
        rel = path.relative_to(ROOT).as_posix()
        files.append({
            'path': rel,
            'size': path.stat().st_size,
            'sha256': file_sha256(path),
        })
    return {
        'manifest_schema': 'stone-tool-release/v1',
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'server_version': server.SERVER_VERSION,
        'tool_html': server.TOOL_HTML,
        'include_reference': include_reference,
        'include_legacy': include_legacy,
        'output_name': output.name,
        'file_count': len(files),
        'files': files,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description='Build a portable release ZIP.')
    parser.add_argument('--apply', action='store_true', help='Create the ZIP. Default is dry-run.')
    parser.add_argument('--include-reference', action='store_true', help='Include reference PDFs/images/example files.')
    parser.add_argument('--include-legacy', action='store_true', help='Include legacy HTML and helper BAT files.')
    parser.add_argument('--output', help='ZIP path. Defaults to release/stone_tool_*.zip.')
    args = parser.parse_args()

    paths = existing_files(args.include_reference, args.include_legacy)
    output = Path(args.output).resolve() if args.output else default_output_name(args.include_reference, args.include_legacy)
    if not output.is_absolute():
        output = (ROOT / output).resolve()

    print('Release bundle contents:')
    for path in paths:
        print(f' - {path.relative_to(ROOT)} ({format_size(path)})')
    print(f'\nOutput: {output}')

    if not args.apply:
        print('\nDry run only. Re-run with --apply to create the ZIP.')
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest(paths, args.include_reference, args.include_legacy, output)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in paths:
            archive.write(path, path.relative_to(ROOT))
        archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

    print(f'Created: {output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
