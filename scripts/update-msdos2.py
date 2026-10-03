#!/usr/bin/env python3
"""Import a built, clean kumakumapon/MS-DOS PC-98 checkout with provenance."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def git(checkout, *args):
    return subprocess.check_output(['git', '-C', str(checkout), *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkout', type=Path, help='MS-DOS checkout with ports/pc98/build outputs')
    args = parser.parse_args()
    source = args.checkout.resolve()
    if git(source, 'status', '--porcelain', '--untracked-files=no'):
        raise ValueError('MS-DOS tracked sources must be clean before importing')
    commit = git(source, 'rev-parse', 'HEAD')
    build = source / 'ports/pc98/build'
    manifest = json.loads((build / 'manifest.json').read_text())
    image = (build / 'msdos2-pc98.xdf').read_bytes()
    digest = hashlib.sha256(image).hexdigest()
    if len(image) != 1261568 or digest != manifest['sha256']:
        raise ValueError('invalid PC-98 image size or manifest checksum')
    if image[1024:3072] != image[3072:5120]:
        raise ValueError('FAT copies differ')
    # Confirm the distributed kernel, shell and license are the original files.
    for disk_name, source_name in [('MSDOS.SYS', 'v2.0/bin/MSDOS.SYS'),
                                   ('COMMAND.COM', 'v2.0/bin/COMMAND.COM'),
                                   ('DOSLIC.TXT', 'LICENSE')]:
        expected = hashlib.sha256((source / source_name).read_bytes()).hexdigest()
        if not any(f['name'] == disk_name and f['sha256'] == expected for f in manifest['files']):
            raise ValueError(f'{disk_name} does not match the source checkout')
    destination = Path(__file__).resolve().parents[1] / 'public/msdos2'
    destination.mkdir(parents=True, exist_ok=True)
    name = f'msdos2-pc98-{digest[:12]}.xdf'
    manifest.update(image=name, source_repository='https://github.com/kumakumapon/MS-DOS',
                    source_commit=commit, source_path='ports/pc98', license='MIT')
    (destination / name).write_bytes(image)
    (destination / 'LICENSE.txt').write_bytes((source / 'LICENSE').read_bytes())
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Imported {name} from MS-DOS {commit}')
    print('Keep old image filenames available for saved disks and shared URLs.')


if __name__ == '__main__':
    main()
