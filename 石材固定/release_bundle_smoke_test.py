# -*- coding: utf-8 -*-
"""Smoke tests for the release bundle builder."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
import zipfile
import fnmatch
import json
import warnings
from pathlib import Path
from unittest import mock

import cleanup_temp
import make_release_bundle
import server
import verify_release_bundle


def rel_names(paths: list[Path]) -> set[str]:
    return {str(path.relative_to(make_release_bundle.ROOT)).replace('\\', '/') for path in paths}


def gitignore_patterns() -> list[str]:
    patterns = []
    for line in (make_release_bundle.ROOT / '.gitignore').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            patterns.append(line)
    return patterns


def sample_for_pattern(pattern: str) -> str:
    if pattern.startswith('*.'):
        return f'sample{pattern[1:]}'
    return pattern.replace('*', 'sample').rstrip('/')


def gitignore_covers(pattern: str, ignored: list[str]) -> bool:
    normalized = pattern.rstrip('/')
    if normalized in {item.rstrip('/') for item in ignored}:
        return True
    sample = sample_for_pattern(normalized)
    return any(fnmatch.fnmatch(sample, item.rstrip('/')) for item in ignored)


class ReleaseBundleSmokeTests(unittest.TestCase):
    def test_core_bundle_contains_required_tool_files(self) -> None:
        names = rel_names(make_release_bundle.existing_files())
        required = {
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
            'release_bundle_smoke_test.py',
            'verify_release_bundle.py',
            'pre_delivery_check.py',
            'make_release_bundle.py',
            'js/calculator.spec.js',
            'js/constants.spec.js',
            'js/regression-smoke.test.js',
            '開啟石材計算書.bat',
            '自我檢查.bat',
            '比對稽核報告.bat',
            '建立交接包.bat',
            '交付前檢查.bat',
        }
        self.assertTrue(required.issubset(names), sorted(required - names))

    def test_core_bundle_excludes_temp_output_reference_and_legacy_files(self) -> None:
        names = rel_names(make_release_bundle.existing_files())
        excluded = {
            'output/',
            '_tmp_stone_report_計算書.docx',
            'tmp-spec-inline.js',
            '石材安裝施工規範.pdf',
            '建築物外牆石材施工規範研擬.pdf',
            '石材計算書產生器_規範版.html',
            '石材計算書產生器_直接Word版.html',
        }
        self.assertFalse(names.intersection(excluded), sorted(names.intersection(excluded)))

    def test_bundle_exclude_patterns_include_cleanup_patterns(self) -> None:
        missing = []
        for pattern in [*cleanup_temp.TEMP_FILE_PATTERNS, *cleanup_temp.TEMP_DIR_PATTERNS]:
            if pattern not in make_release_bundle.BUNDLE_EXCLUDE_PATTERNS:
                missing.append(pattern)
        self.assertEqual(missing, [])

    def test_gitignore_covers_bundle_exclude_patterns(self) -> None:
        ignored = gitignore_patterns()
        missing = [
            pattern
            for pattern in make_release_bundle.BUNDLE_EXCLUDE_PATTERNS
            if not gitignore_covers(pattern, ignored)
        ]
        self.assertEqual(missing, [])

    def test_default_output_name_uses_server_version(self) -> None:
        output = make_release_bundle.default_output_name(False, False)

        self.assertEqual(output.parent.name, 'release')
        self.assertIn(f'stone_tool_V{server.SERVER_VERSION}_core_', output.name)

    def test_manifest_records_release_contents(self) -> None:
        paths = make_release_bundle.existing_files()
        manifest = make_release_bundle.build_manifest(paths, False, False, Path('bundle.zip'))

        self.assertEqual(manifest['manifest_schema'], 'stone-tool-release/v1')
        self.assertEqual(manifest['server_version'], server.SERVER_VERSION)
        self.assertEqual(manifest['tool_html'], server.TOOL_HTML)
        self.assertEqual(manifest['file_count'], len(paths))
        manifest_paths = {item['path'] for item in manifest['files']}
        self.assertIn('README.md', manifest_paths)
        self.assertIn('石材計算書產生器_規範版V2.html', manifest_paths)
        first_file = manifest['files'][0]
        self.assertRegex(first_file['sha256'], r'^[0-9a-f]{64}$')

    def test_core_dir_recursion_excludes_cache_and_temp_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            js_dir = root / 'js'
            js_dir.mkdir()
            (js_dir / 'calculator.spec.js').write_text('keep', encoding='utf-8')
            (js_dir / 'tmp-spec-inline.js').write_text('drop', encoding='utf-8')
            (js_dir / '__pycache__').mkdir()
            (js_dir / '__pycache__' / 'calculator.pyc').write_bytes(b'drop')
            (js_dir / 'tmp').mkdir()
            (js_dir / 'tmp' / 'scratch.txt').write_text('drop', encoding='utf-8')

            with mock.patch.object(make_release_bundle, 'ROOT', root):
                names = rel_names(make_release_bundle.existing_files())

        self.assertIn('js/calculator.spec.js', names)
        self.assertNotIn('js/tmp-spec-inline.js', names)
        self.assertNotIn('js/__pycache__/calculator.pyc', names)
        self.assertNotIn('js/tmp/scratch.txt', names)

    def test_optional_reference_and_legacy_flags_add_expected_files(self) -> None:
        ref_names = rel_names(make_release_bundle.existing_files(include_reference=True))
        legacy_names = rel_names(make_release_bundle.existing_files(include_legacy=True))

        self.assertIn('石材安裝施工規範.pdf', ref_names)
        self.assertIn('建築物外牆石材施工規範研擬.pdf', ref_names)
        self.assertNotIn('石材計算書產生器_規範版.html', ref_names)

        self.assertIn('石材計算書產生器_規範版.html', legacy_names)
        self.assertIn('石材計算書產生器_直接Word版.html', legacy_names)
        self.assertNotIn('石材安裝施工規範.pdf', legacy_names)

    def test_apply_creates_readable_zip_in_requested_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'bundle.zip'
            proc = subprocess.run(
                [sys.executable, str(make_release_bundle.ROOT / 'make_release_bundle.py'), '--apply', '--output', str(out_path)],
                cwd=make_release_bundle.ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
            self.assertTrue(out_path.is_file())
            with zipfile.ZipFile(out_path) as archive:
                names = set(archive.namelist())
                manifest = json.loads(archive.read('RELEASE_MANIFEST.json').decode('utf-8'))

        self.assertIn('README.md', names)
        self.assertIn('RELEASE_MANIFEST.json', names)
        self.assertIn('石材計算書產生器_規範版V2.html', names)
        self.assertIn('js/regression-smoke.test.js', names)
        self.assertIn('audit_compare.py', names)
        self.assertIn('audit_schema.py', names)
        self.assertIn('audit_schema_test.py', names)
        self.assertIn('cleanup_temp.py', names)
        self.assertIn('cleanup_temp_test.py', names)
        self.assertNotIn('output/', names)
        self.assertEqual(manifest['server_version'], server.SERVER_VERSION)
        self.assertIn('README.md', {item['path'] for item in manifest['files']})

    def test_verify_release_bundle_accepts_generated_zip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'bundle.zip'
            proc = subprocess.run(
                [sys.executable, str(make_release_bundle.ROOT / 'make_release_bundle.py'), '--apply', '--output', str(out_path)],
                cwd=make_release_bundle.ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
            ok, errors, manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertTrue(ok, errors)
        self.assertEqual(manifest['server_version'], server.SERVER_VERSION)

    def test_verify_release_bundle_rejects_missing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'no_manifest.zip'
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('README.md', 'tampered')

            with self.assertRaisesRegex(ValueError, 'Missing RELEASE_MANIFEST.json'):
                verify_release_bundle.verify_bundle(out_path)

    def test_verify_release_bundle_rejects_hash_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'tampered.zip'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'server_version': server.SERVER_VERSION,
                'file_count': 1,
                'files': [
                    {
                        'path': 'README.md',
                        'size': 8,
                        'sha256': '0' * 64,
                    }
                ],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('README.md', 'tampered')
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('SHA-256 mismatch: README.md', errors)

    def test_verify_release_bundle_rejects_unlisted_extra_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'extra.zip'
            readme = b'expected'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'server_version': server.SERVER_VERSION,
                'file_count': 1,
                'files': [
                    {
                        'path': 'README.md',
                        'size': len(readme),
                        'sha256': verify_release_bundle.bytes_sha256(readme),
                    }
                ],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('README.md', readme)
                archive.writestr('UNLISTED.txt', 'extra')
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Unexpected file in ZIP: UNLISTED.txt', errors)

    def test_verify_release_bundle_rejects_unsafe_manifest_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'unsafe_manifest.zip'
            payload = b'unsafe'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'server_version': server.SERVER_VERSION,
                'file_count': 1,
                'files': [
                    {
                        'path': '../README.md',
                        'size': len(payload),
                        'sha256': verify_release_bundle.bytes_sha256(payload),
                    }
                ],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('../README.md', payload)
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Unsafe manifest path: ../README.md', errors)
        self.assertIn('Unsafe ZIP path: ../README.md', errors)

    def test_verify_release_bundle_rejects_backslash_manifest_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'unsafe_manifest_backslash.zip'
            payload = b'unsafe'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'server_version': server.SERVER_VERSION,
                'file_count': 1,
                'files': [
                    {
                        'path': 'dir\\file.txt',
                        'size': len(payload),
                        'sha256': verify_release_bundle.bytes_sha256(payload),
                    }
                ],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('dir/file.txt', payload)
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Unsafe manifest path: dir\\file.txt', errors)

    def test_verify_release_bundle_rejects_duplicate_manifest_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'duplicate_manifest.zip'
            payload = b'expected'
            entry = {
                'path': 'README.md',
                'size': len(payload),
                'sha256': verify_release_bundle.bytes_sha256(payload),
            }
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'server_version': server.SERVER_VERSION,
                'file_count': 2,
                'files': [entry, dict(entry)],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('README.md', payload)
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Duplicate manifest path: README.md', errors)

    def test_verify_release_bundle_rejects_duplicate_zip_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'duplicate_zip.zip'
            payload = b'expected'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'server_version': server.SERVER_VERSION,
                'file_count': 1,
                'files': [
                    {
                        'path': 'README.md',
                        'size': len(payload),
                        'sha256': verify_release_bundle.bytes_sha256(payload),
                    }
                ],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('README.md', payload)
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    archive.writestr('README.md', payload)
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Duplicate ZIP path: README.md', errors)

    def test_verify_release_bundle_rejects_invalid_manifest_schema(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'bad_schema.zip'
            manifest = {
                'manifest_schema': 'stone-tool-release/v0',
                'created_at': '2026-04-25T00:00:00+0800',
                'server_version': server.SERVER_VERSION,
                'tool_html': server.TOOL_HTML,
                'include_reference': False,
                'include_legacy': False,
                'output_name': 'bad_schema.zip',
                'file_count': 0,
                'files': [],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Invalid manifest_schema: stone-tool-release/v0', errors)

    def test_verify_release_bundle_rejects_invalid_top_level_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'bad_top_level.zip'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'created_at': 'not-a-date',
                'server_version': '',
                'tool_html': '',
                'include_reference': 'no',
                'include_legacy': None,
                'output_name': '../bad.zip',
                'file_count': 0,
                'files': [],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        for expected in [
            'Invalid created_at',
            'Invalid server_version',
            'Invalid tool_html',
            'Invalid include_reference',
            'Invalid include_legacy',
            'Invalid output_name',
        ]:
            self.assertIn(expected, errors)

    def test_verify_release_bundle_rejects_output_name_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'actual.zip'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'created_at': '2026-04-25T00:00:00+0800',
                'server_version': server.SERVER_VERSION,
                'tool_html': server.TOOL_HTML,
                'include_reference': False,
                'include_legacy': False,
                'output_name': 'different.zip',
                'file_count': 0,
                'files': [],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('output_name mismatch: manifest=different.zip actual=actual.zip', errors)

    def test_verify_release_bundle_rejects_flavor_flag_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / f'stone_tool_V{server.SERVER_VERSION}_with_refs_20260425_000000.zip'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'created_at': '2026-04-25T00:00:00+0800',
                'server_version': server.SERVER_VERSION,
                'tool_html': server.TOOL_HTML,
                'include_reference': False,
                'include_legacy': False,
                'output_name': out_path.name,
                'file_count': 0,
                'files': [],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Flavor mismatch: with_refs', errors)

    def test_verify_release_bundle_rejects_filename_version_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'stone_tool_V9.9.9_core_20260425_000000.zip'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'created_at': '2026-04-25T00:00:00+0800',
                'server_version': server.SERVER_VERSION,
                'tool_html': server.TOOL_HTML,
                'include_reference': False,
                'include_legacy': False,
                'output_name': out_path.name,
                'file_count': 0,
                'files': [],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn(f'Filename version mismatch: name=9.9.9 manifest={server.SERVER_VERSION}', errors)

    def test_verify_release_bundle_rejects_invalid_file_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'bad_metadata.zip'
            manifest = {
                'manifest_schema': 'stone-tool-release/v1',
                'created_at': '2026-04-25T00:00:00+0800',
                'server_version': server.SERVER_VERSION,
                'tool_html': server.TOOL_HTML,
                'include_reference': False,
                'include_legacy': False,
                'output_name': 'bad_metadata.zip',
                'file_count': 1,
                'files': [
                    {
                        'path': 'README.md',
                        'size': '8',
                        'sha256': 'not-a-sha',
                    }
                ],
            }
            with zipfile.ZipFile(out_path, 'w') as archive:
                archive.writestr('README.md', 'expected')
                archive.writestr('RELEASE_MANIFEST.json', json.dumps(manifest))

            ok, errors, _manifest = verify_release_bundle.verify_bundle(out_path)

        self.assertFalse(ok)
        self.assertIn('Invalid size for README.md', errors)


if __name__ == '__main__':
    runner = unittest.TextTestRunner(stream=sys.stdout, verbosity=2)
    unittest.main(testRunner=runner)
