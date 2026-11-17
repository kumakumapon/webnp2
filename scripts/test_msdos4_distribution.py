import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from msdos4_distribution import sync_distribution


class DistributionTest(unittest.TestCase):
    def test_sync_and_prune_preserves_references_other_files_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            media = root / 'public/msdos4'
            media.mkdir(parents=True)
            current = 'msdos4-retrobasic-111111111111.xdf'
            old = 'msdos4-retrobasic-222222222222.xdf'
            kept = 'msdos4-retrobasic-333333333333.xdf'
            linked = 'msdos4-retrobasic-444444444444.xdf'
            (media / current).write_bytes(b'current')
            (media / old).write_bytes(b'old')
            (media / kept).write_bytes(b'kept')
            (media / 'user.xdf').write_bytes(b'user')
            (media / linked).symlink_to('user.xdf')
            (root / 'README.md').write_text(f'Boot {old}')
            (root / 'public/help.html').write_text(f'href="./?fd1=./msdos4/{old}"')
            (root / 'archive.md').write_text(f'Preserved reference: {kept}')
            (media / 'manifest.json').write_text(json.dumps({'image': current, 'sha256': hashlib.sha256(b'current').hexdigest()}))
            self.assertEqual(sync_distribution(root, prune=True), [old])
            self.assertIn(current, (root / 'public/help.html').read_text())
            for name in [current, kept, 'user.xdf', linked]:
                self.assertTrue((media / name).exists())
            self.assertEqual(sync_distribution(root, prune=True), [])

    def test_invalid_manifest_does_not_edit_or_remove_any_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            media = root / 'public/msdos4'
            media.mkdir(parents=True)
            for name in ['../outside.xdf', 'msdos4-retrobasic-111111111111.xdf']:
                (media / 'manifest.json').write_text(json.dumps({'image': name, 'sha256': 'bad'}))
                (media / 'msdos4-retrobasic-111111111111.xdf').write_bytes(b'keep')
                with self.assertRaises(ValueError):
                    sync_distribution(root, prune=True)
                self.assertEqual((media / 'msdos4-retrobasic-111111111111.xdf').read_bytes(), b'keep')
