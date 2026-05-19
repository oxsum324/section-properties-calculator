# -*- coding: utf-8 -*-
"""Smoke tests for cleanup_temp.py."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import cleanup_temp


class CleanupTempTests(unittest.TestCase):
    def test_gitignore_covers_cleanup_patterns(self) -> None:
        gitignore = (cleanup_temp.ROOT / '.gitignore').read_text(encoding='utf-8')
        missing = []
        for pattern in cleanup_temp.TEMP_FILE_PATTERNS:
            if pattern not in gitignore:
                missing.append(pattern)
        for pattern in cleanup_temp.TEMP_DIR_PATTERNS:
            if pattern not in gitignore and f'{pattern}/' not in gitignore:
                missing.append(pattern)
        self.assertEqual(missing, [])

    def test_candidates_find_known_temp_files_and_dirs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'tmp-spec-inline-test.js').write_text('temp', encoding='utf-8')
            (root / '_tmp_spec_case').mkdir()
            (root / 'keep.txt').write_text('keep', encoding='utf-8')

            with mock.patch.object(cleanup_temp, 'ROOT', root):
                names = {path.name for path in cleanup_temp.candidates()}

        self.assertEqual(names, {'tmp-spec-inline-test.js', '_tmp_spec_case'})

    def test_remove_path_refuses_outside_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as root_tmp, tempfile.TemporaryDirectory() as outside_tmp:
            root = Path(root_tmp)
            outside = Path(outside_tmp) / 'outside.tmp'
            outside.write_text('do not remove', encoding='utf-8')

            with mock.patch.object(cleanup_temp, 'ROOT', root):
                with self.assertRaisesRegex(RuntimeError, 'outside workspace'):
                    cleanup_temp.remove_path(outside)

            self.assertTrue(outside.exists())

    def test_remove_path_refuses_workspace_root(self) -> None:
        with tempfile.TemporaryDirectory() as root_tmp:
            root = Path(root_tmp)
            marker = root / 'keep.txt'
            marker.write_text('do not remove', encoding='utf-8')

            with mock.patch.object(cleanup_temp, 'ROOT', root):
                with self.assertRaisesRegex(RuntimeError, 'workspace root'):
                    cleanup_temp.remove_path(root)

            self.assertTrue(marker.exists())

    def test_remove_path_deletes_known_workspace_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / 'server-test.log'
            target.write_text('temp', encoding='utf-8')

            with mock.patch.object(cleanup_temp, 'ROOT', root):
                cleanup_temp.remove_path(target)

            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
