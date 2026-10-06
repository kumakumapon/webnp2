#!/usr/bin/env python3
"""Refresh the bundled DOS 4 disk from the PC-98 XMS/EMS-enabled MS-DOS build."""
import argparse
import hashlib
import importlib.util
import json
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISK_SIZE = 1261568
DRIVERS = {
    'FDXMS286.SYS': {
        'version': '0.03.Temperaments.r1 (PC-98)',
        'license': 'GPL-2.0-only',
        'license_file': 'XMSLIC.TXT',
        'repository': 'https://github.com/FDOS/himem',
        'source_commit': '25aca5c4bec2fc4197c9b0f71c6d7dd1c331e96f',
    },
    'EMM386.EXE': {
        'version': '2.26 NEC PC-98',
        'license': 'Artistic-1.0',
        'license_file': 'EMM386L.TXT',
        'repository': 'https://github.com/lpproj/emm386.nec',
        'source_commit': 'e3bfad17d85a549876f08c7ddb656302a4541db7',
    },
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def disk_files(image):
    """Read the 1232 KiB image's fixed FAT12 geometry, including fragmented files."""
    if len(image) != DISK_SIZE or image[1024:3072] != image[3072:5120]:
        raise ValueError('invalid image size or mismatched FAT copies')
    fat, files = image[1024:3072], {}
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
    msdos = args.msdos.resolve()
    if subprocess.check_output(['git', '-C', str(msdos), 'status', '--porcelain',
                                '--untracked-files=no'], text=True).strip():
        raise ValueError('MS-DOS tracked sources must be clean before importing')
    source_commit = subprocess.check_output(['git', '-C', str(msdos), 'rev-parse', 'HEAD'],
                                             text=True).strip()

    current_manifest = json.loads((ROOT / 'public/msdos4/manifest.json').read_text())
    current_path = ROOT / 'public/msdos4' / current_manifest['image']
    current_image = current_path.read_bytes()
    if sha256(current_image) != current_manifest['sha256']:
        raise ValueError('current bundled image does not match its manifest')
    current_files = disk_files(current_image)

    build = msdos / 'ports/pc98/build/dos4'
    source_manifest = json.loads((build / 'manifest.json').read_text())
    source_path = build / source_manifest['image']
    source_image = source_path.read_bytes()
    if sha256(source_image) != source_manifest['sha256']:
        raise ValueError('MS-DOS image does not match its build manifest')
    source_files = disk_files(source_image)
    for file in source_manifest['files']:
        data = source_files.get(file['name'])
        if data is None or len(data) != file['size'] or sha256(data) != file['sha256']:
            raise ValueError(f"MS-DOS image manifest mismatch: {file['name']}")

    config = source_files['CONFIG.SYS']
    if b'DEVICE=FDXMS286.SYS\r\n' not in config or \
            b'DEVICE=EMM386.EXE EMM=8192\r\n' not in config:
        raise ValueError('source image is missing the tested XMS/EMS CONFIG.SYS')
    for name, info in DRIVERS.items():
        if name not in source_files or info['license_file'] not in source_files:
            raise ValueError(f'source image is missing {name} or its license')
        info['sha256'] = sha256(source_files[name])
        info['license_sha256'] = sha256(source_files[info['license_file']])
    if source_files['DOSLIC.TXT'] != current_files['DOSLIC.TXT']:
        raise ValueError('upstream DOS license changed; review the bundled notice before importing')

    # Keep existing bundled applications and notices while refreshing all files
    # produced by the newer DOS build. The prior AUTOEXEC and combined MIT notice
    # remain unchanged; the third-party driver licenses stay as separate files.
    files = {**current_files, **source_files}
    files['AUTOEXEC.BAT'] = current_files['AUTOEXEC.BAT']
    files['LICENSE.TXT'] = current_files['LICENSE.TXT']

    spec = importlib.util.spec_from_file_location('pc98_image', msdos / 'ports/pc98/image.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    # image.py always inserts DOSLIC.TXT from the matching MS-DOS checkout.
    excluded = {'IO.SYS', 'MSDOS.SYS', 'COMMAND.COM', 'AUTOEXEC.BAT', 'DOSLIC.TXT'}
    extra = [(name, files[name]) for name in sorted(files) if name not in excluded]
    image, entries = helper.make_image(
        source_image[:1024], files['IO.SYS'], extra,
        kernel=files['MSDOS.SYS'], command=files['COMMAND.COM'],
        autoexec=files['AUTOEXEC.BAT'],
    )
    digest = sha256(image)
    name = f'msdos4-retrobasic-{digest[:12]}.xdf'

    current_manifest['image'] = name
    current_manifest['sha256'] = digest
    current_manifest['files'] = entries
    current_manifest['dos_commit'] = source_commit
    current_manifest['sources']['msdos']['commit'] = source_commit
    current_manifest['sources']['filer']['commit'] = source_commit
    current_manifest['sources']['editor']['commit'] = source_commit
    current_manifest['memory_drivers'] = DRIVERS
    current_manifest['license'] = 'MIT + GPL-2.0-only + Artistic-1.0'

    destination = ROOT / 'public/msdos4'
    (destination / name).write_bytes(image)
    (destination / 'manifest.json').write_text(json.dumps(current_manifest, indent=2) + '\n')
    print(f'Wrote {name}: {digest}')


if __name__ == '__main__':
    main()
