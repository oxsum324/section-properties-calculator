# -*- coding: utf-8 -*-
"""Verify a release ZIP against its embedded RELEASE_MANIFEST.json."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path


MANIFEST_NAME = 'RELEASE_MANIFEST.json'
MANIFEST_SCHEMA = 'stone-tool-release/v1'
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')
CREATED_AT_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}')
FLAVOR_FLAGS = {
    'core': (False, False),
    'with_refs': (True, False),
    'with_legacy': (False, True),
    'full': (True, True),
}
DEFAULT_NAME_RE = re.compile(r'^stone_tool_V(?P<version>[^_]+)_(?P<flavor>core|with_refs|with_legacy|full)_')


def bytes_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_safe_zip_path(name: str) -> bool:
    if not name or '\\' in name:
        return False
    if name.startswith('/') or name.startswith('../') or name == '..':
        return False
    return '..' not in name.split('/')


def release_flavor_from_name(name: str) -> str | None:
    stem = name[:-4] if name.lower().endswith('.zip') else name
    for flavor in sorted(FLAVOR_FLAGS, key=len, reverse=True):
        if f'_{flavor}_' in stem:
            return flavor
    return None


def default_name_parts(name: str) -> tuple[str, str] | None:
    match = DEFAULT_NAME_RE.match(name)
    if not match:
        return None
    return match.group('version'), match.group('flavor')


def load_manifest(archive: zipfile.ZipFile) -> dict:
    try:
        raw = archive.read(MANIFEST_NAME)
    except KeyError as exc:
        raise ValueError(f'Missing {MANIFEST_NAME}') from exc
    try:
        manifest = json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f'Invalid {MANIFEST_NAME}') from exc
    if not isinstance(manifest, dict):
        raise ValueError(f'Invalid {MANIFEST_NAME}: expected object')
    return manifest


def verify_bundle(path: Path) -> tuple[bool, list[str], dict]:
    errors: list[str] = []
    with zipfile.ZipFile(path) as archive:
        raw_names = archive.namelist()
        names = set(raw_names)
        seen_names = set()
        for name in raw_names:
            if name in seen_names:
                errors.append(f'Duplicate ZIP path: {name}')
            seen_names.add(name)
        for name in sorted(names):
            if not is_safe_zip_path(name):
                errors.append(f'Unsafe ZIP path: {name}')
        manifest = load_manifest(archive)
        if manifest.get('manifest_schema') != MANIFEST_SCHEMA:
            errors.append(f'Invalid manifest_schema: {manifest.get("manifest_schema")}')
        if not isinstance(manifest.get('server_version'), str) or not manifest.get('server_version'):
            errors.append('Invalid server_version')
        if not isinstance(manifest.get('created_at'), str) or not CREATED_AT_RE.match(manifest.get('created_at', '')):
            errors.append('Invalid created_at')
        if not isinstance(manifest.get('tool_html'), str) or not manifest.get('tool_html'):
            errors.append('Invalid tool_html')
        if not isinstance(manifest.get('include_reference'), bool):
            errors.append('Invalid include_reference')
        if not isinstance(manifest.get('include_legacy'), bool):
            errors.append('Invalid include_legacy')
        output_name = manifest.get('output_name')
        if not isinstance(output_name, str) or not output_name.lower().endswith('.zip') or not is_safe_zip_path(output_name):
            errors.append('Invalid output_name')
        elif output_name != path.name:
            errors.append(f'output_name mismatch: manifest={output_name} actual={path.name}')
        else:
            default_parts = default_name_parts(output_name)
            if default_parts and isinstance(manifest.get('server_version'), str):
                name_version, _name_flavor = default_parts
                if name_version != manifest.get('server_version'):
                    errors.append(f'Filename version mismatch: name={name_version} manifest={manifest.get("server_version")}')
            flavor = release_flavor_from_name(output_name)
            if flavor is not None and isinstance(manifest.get('include_reference'), bool) and isinstance(manifest.get('include_legacy'), bool):
                expected_reference, expected_legacy = FLAVOR_FLAGS[flavor]
                if manifest.get('include_reference') != expected_reference or manifest.get('include_legacy') != expected_legacy:
                    errors.append(f'Flavor mismatch: {flavor}')
        files = manifest.get('files')
        if not isinstance(files, list):
            return False, [f'Invalid {MANIFEST_NAME}: files should be a list'], manifest

        file_count = manifest.get('file_count')
        if not isinstance(file_count, int) or file_count < 0:
            errors.append(f'Invalid file_count: {file_count}')
        elif file_count != len(files):
            errors.append(f'file_count mismatch: manifest={manifest.get("file_count")} actual={len(files)}')

        expected_names = set()
        for item in files:
            if not isinstance(item, dict):
                errors.append('Invalid manifest file entry')
                continue
            rel = item.get('path')
            if not isinstance(rel, str) or not rel:
                errors.append('Invalid manifest path entry')
                continue
            if not is_safe_zip_path(rel):
                errors.append(f'Unsafe manifest path: {rel}')
                continue
            if rel in expected_names:
                errors.append(f'Duplicate manifest path: {rel}')
                continue
            expected_names.add(rel)
            if rel not in names:
                errors.append(f'Missing file in ZIP: {rel}')
                continue
            data = archive.read(rel)
            expected_size = item.get('size')
            if not isinstance(expected_size, int) or expected_size < 0:
                errors.append(f'Invalid size for {rel}')
                continue
            if expected_size != len(data):
                errors.append(f'Size mismatch: {rel}')
            expected_hash = item.get('sha256')
            if not isinstance(expected_hash, str) or not SHA256_RE.match(expected_hash):
                errors.append(f'Invalid SHA-256 for {rel}')
                continue
            actual_hash = bytes_sha256(data)
            if expected_hash != actual_hash:
                errors.append(f'SHA-256 mismatch: {rel}')

        extra_names = sorted(names - expected_names - {MANIFEST_NAME})
        for rel in extra_names:
            errors.append(f'Unexpected file in ZIP: {rel}')

    return not errors, errors, manifest


def main() -> int:
    parser = argparse.ArgumentParser(description='Verify a release ZIP manifest and file hashes.')
    parser.add_argument('zip_path', help='Path to release ZIP created by make_release_bundle.py')
    args = parser.parse_args()

    path = Path(args.zip_path)
    if not path.is_file():
        print(f'[FAIL] ZIP not found: {path}')
        return 1
    try:
        ok, errors, manifest = verify_bundle(path)
    except (zipfile.BadZipFile, ValueError) as exc:
        print(f'[FAIL] {exc}')
        return 1

    if not ok:
        print('[FAIL] Release bundle verification failed:')
        for error in errors:
            print(f' - {error}')
        return 1

    print('Release bundle verification passed.')
    print(f' - version: {manifest.get("server_version", "unknown")}')
    print(f' - files: {manifest.get("file_count", 0)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
