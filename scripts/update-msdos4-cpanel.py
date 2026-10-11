#!/usr/bin/env python3
"""Add CPANEL.COM from MS-DOS to the currently bundled DOS 4 PC-98 image."""
import argparse
import hashlib
import importlib.util
import json
import struct
import subprocess
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(checkout, *args):
    return subprocess.check_output(
        ['git', '-C', str(checkout), *args], text=True
    ).strip()


def disk_files(image):
    """Read files from the bundled 1232 KiB FAT12 floppy."""
    if len(image) != 1232 * 1024:
        raise ValueError('unexpected DOS 4 image size')
    fat = image[1024:3072]
    if fat != image[3072:5120]:
        raise ValueError('FAT copies differ')
    files = {}
    for offset in range(5 * 1024, 11 * 1024, 32):
        entry = image[offset:offset + 32]
        if entry[0] == 0:
            break
        if entry[0] == 0xe5 or entry[11] & 0x18:
            continue
        name = entry[:8].decode('ascii').rstrip()
        extension = entry[8:11].decode('ascii').rstrip()
        name += '.' + extension if extension else ''
        cluster, size = struct.unpack_from('<HI', entry, 26)
        data, seen = bytearray(), set()
        while cluster < 0xff8:
            if cluster < 2 or cluster >= 1223 or cluster in seen:
                raise ValueError(f'invalid FAT chain for {name}')
            seen.add(cluster)
            start = (11 + cluster - 2) * 1024
            data.extend(image[start:start + 1024])
            index = cluster * 3 // 2
            value = int.from_bytes(fat[index:index + 2], 'little')
            cluster = (value >> 4 if cluster & 1 else value) & 0xfff
        if len(data) < size or name in files:
            raise ValueError(f'invalid file entry for {name}')
        files[name] = bytes(data[:size])
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('msdos', type=Path, help='clean kumakumapon/MS-DOS checkout')
    args = parser.parse_args()
    dos = args.msdos.resolve()
    webnp2 = Path(__file__).resolve().parents[1]
    manifest_path = webnp2 / 'public/msdos4/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    image_path = manifest_path.parent / manifest['image']
    original = image_path.read_bytes()
    if digest(original) != manifest['sha256']:
        raise ValueError('bundled DOS 4 image checksum does not match its manifest')
    files = disk_files(original)
    if len(files) != len(manifest['files']):
        raise ValueError('manifest does not list every disk file')
    for item in manifest['files']:
        data = files.get(item['name'])
        if data is None or len(data) != item['size'] or digest(data) != item['sha256']:
            raise ValueError(f"manifest mismatch: {item['name']}")

    control = dos / 'tools/control'
    subprocess.run(['make', '-C', str(control), 'all'], check=True)
    license_text = (control / 'LICENSE').read_bytes()
    marker = b'\r\nCPANEL license\r\n'
    notices = files['LICENSE.TXT']
    suffix = marker + license_text
    if notices.endswith(suffix):
        notices = notices[:-len(suffix)]
    notices += suffix

    apps = {
        'CPANEL.COM': (control / 'build/CPANEL.COM').read_bytes(),
        'CPANEL.TXT': (control / 'build/CPANEL.TXT').read_bytes(),
        'CPLIC.TXT': (control / 'build/CPLIC.TXT').read_bytes(),
    }
    excluded = {
        'IO.SYS', 'MSDOS.SYS', 'COMMAND.COM', 'AUTOEXEC.BAT', 'DOSLIC.TXT',
        'CPANEL.COM', 'CPANEL.TXT', 'CPLIC.TXT',
    }
    extra = [(name, notices if name == 'LICENSE.TXT' else data)
             for name, data in files.items() if name not in excluded]
    extra.extend(apps.items())
    autoexec = files['AUTOEXEC.BAT']
    startup = b'ECHO CPANEL: System settings\r\n'
    if startup not in autoexec:
        autoexec += startup

    helper_path = dos / 'ports/pc98/image.py'
    spec = importlib.util.spec_from_file_location('pc98_image', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    image, entries = helper.make_image(
        original[:1024], files['IO.SYS'], extra,
        kernel=files['MSDOS.SYS'], command=files['COMMAND.COM'],
        autoexec=autoexec,
    )
    sha256 = digest(image)
    commit = git(dos, 'rev-parse', 'HEAD')
    sources = manifest.setdefault('sources', {})
    repository = 'https://github.com/kumakumapon/MS-DOS'
    sources['msdos'] = {
        'component': 'MS-DOS', 'commit': commit, 'path': 'ports/pc98',
        'license': 'MIT', 'repository': repository,
    }
    for key, component, path in [
        ('filer', 'FD Filer', 'tools/filer'),
        ('editor', 'EDIT98', 'tools/editor'),
        ('control', 'CPANEL', 'tools/control'),
    ]:
        sources[key] = {
            'component': component, 'repository': repository,
            'commit': commit, 'path': path, 'license': 'MIT',
        }
    manifest.update(
        image=f'msdos4-retrobasic-{sha256[:12]}.xdf',
        sha256=sha256, files=entries, dos_commit=commit,
    )
    destination = manifest_path.parent
    (destination / manifest['image']).write_bytes(image)
    (destination / 'LICENSE.txt').write_bytes(notices)
    (destination / 'CPANEL.txt').write_bytes(apps['CPANEL.TXT'])
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"Updated {destination / manifest['image']} ({sha256})")


if __name__ == '__main__':
    main()
