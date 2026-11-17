"""Keep managed DOS4 links aligned with the manifest and prune unreferenced media."""
import hashlib
import json
import re
from pathlib import Path

IMAGE = re.compile(r'msdos4-retrobasic-[0-9a-f]{12}\.xdf')
SKIP = {'.git', 'node_modules', 'dist', 'test-results', '.work', '__pycache__'}
TEXT = {'.md', '.txt', '.html', '.json', '.ts', '.mjs', '.yml'}


def sync_distribution(root, prune=False):
    root = Path(root)
    media = root / 'public/msdos4'
    manifest = json.loads((media / 'manifest.json').read_text())
    name = manifest['image']
    if not IMAGE.fullmatch(name):
        raise ValueError('Invalid managed DOS4 image name')
    image = media / name
    if image.is_symlink() or hashlib.sha256(image.read_bytes()).hexdigest() != manifest['sha256']:
        raise ValueError('DOS4 manifest/image checksum mismatch')
    for relative in ['README.md', 'README.ja.md', 'public/help.html', 'public/msdos4/README.txt']:
        path = root / relative
        if not path.exists():
            continue
        text = path.read_text()
        updated = IMAGE.sub(name, text)
        if text != updated:
            path.write_text(updated)
    referenced = {name}
    # Walk only project text; never follow symlinks into another checkout or user data.
    def scan(directory):
        for path in directory.iterdir():
            if path.is_symlink() or path.name in SKIP:
                continue
            if path.is_dir():
                scan(path)
            elif path.suffix in TEXT:
                referenced.update(IMAGE.findall(path.read_text(errors='replace')))
    scan(root)
    removed = []
    if prune:
        for path in media.iterdir():
            if IMAGE.fullmatch(path.name) and not path.is_symlink() and path.is_file() and path.name not in referenced:
                path.unlink()
                removed.append(path.name)
    return removed


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prune', action='store_true')
    args = parser.parse_args()
    removed = sync_distribution(Path(__file__).resolve().parents[1], args.prune)
    print(f'DOS4 links synchronized; removed {len(removed)} unreferenced managed images')
