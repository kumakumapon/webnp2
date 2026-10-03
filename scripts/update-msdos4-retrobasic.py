#!/usr/bin/env python3
"""Import the source-built DOS 4.0 + native RetroBasic PC-98 boot floppy."""
import argparse
import hashlib
import importlib.util
import json
import struct
import subprocess
from pathlib import Path


def git(checkout, *args):
    return subprocess.check_output(['git', '-C', str(checkout), *args], text=True).strip()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def disk_files(image):
    """Read the 1232 KiB image's fixed FAT12 geometry, including fragmented files."""
    fat = image[1024:3072]
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
    parser.add_argument('msdos', type=Path)
    parser.add_argument('retrobasic', type=Path)
    args = parser.parse_args()
    dos, basic = args.msdos.resolve(), args.retrobasic.resolve()
    sources = {}
    for name, checkout, component in [
        ('msdos', dos, 'MS-DOS'), ('retrobasic', basic, 'RetroBasic'),
    ]:
        if git(checkout, 'status', '--porcelain', '--untracked-files=no'):
            raise ValueError(f'{component} tracked sources must be clean before importing')
        sources[name] = {'component': component,
                         'commit': git(checkout, 'rev-parse', 'HEAD'), 'path': 'ports/pc98',
                         'license': 'MIT'}
    sources['msdos']['repository'] = 'https://github.com/kumakumapon/MS-DOS'
    build = basic / 'ports/pc98/build'
    manifest = json.loads((build / 'manifest.json').read_text())
    image = (build / 'retrobasic-pc98.xdf').read_bytes()
    sha256 = digest(image)
    if manifest['dos_version'] != '4' or manifest['dos_commit'] != sources['msdos']['commit']:
        raise ValueError('rebuild RetroBasic with --dos-version 4 from this MS-DOS commit')
    if len(image) != 1261568 or sha256 != manifest['sha256']:
        raise ValueError('invalid PC-98 image size or checksum')
    if image[1024:3072] != image[3072:5120]:
        raise ValueError('FAT copies differ')
    files = disk_files(image)
    if len(files) != len(manifest['files']):
        raise ValueError('manifest does not list every disk file')
    for file in manifest['files']:
        data = files[file['name']]
        if len(data) != file['size'] or digest(data) != file['sha256']:
            raise ValueError(f"manifest mismatch: {file['name']}")
    # Check source-built executables, boot code, samples, and license notices.
    dos_build = dos / 'ports/pc98/build/dos4'
    spec = importlib.util.spec_from_file_location('pc98_image', dos / 'ports/pc98/image.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    notices = b'MS-DOS license\r\n' + (dos / 'LICENSE').read_bytes()
    notices += b'\r\nRetroBasic license\r\n' + (basic / 'LICENSE').read_bytes()
    expected = {
        'IO.SYS': helper.flatten_exe((dos_build / 'bios.exe').read_bytes()),
        'MSDOS.SYS': (dos_build / 'MSDOS.SYS').read_bytes(),
        'COMMAND.COM': (dos_build / 'COMMAND.COM').read_bytes(),
        'P98TEST.COM': (dos_build / 'P98TEST.COM').read_bytes(),
        'RBASIC.COM': (build / 'RBASIC.COM').read_bytes(),
        'DOSLIC.TXT': (dos / 'LICENSE').read_bytes(),
        'LICENSE.TXT': notices,
        'AUTOEXEC.BAT': b'@ECHO OFF\r\nECHO MS-DOS 4.0 PC-98 / WebNP2\r\n',
        'CONFIG.SYS': b'FILES=20\r\nBUFFERS=8\r\nLASTDRIVE=A\r\n',
    }
    samples = {'primes.bas': 'PRIMES.BAS', 'functions_test.bas': 'FUNCTEST.BAS',
               'graphics_demo.bas': 'GRAPHICS.BAS', 'wave3d.bas': 'WAVE3D.BAS',
               'mandelbrot.bas': 'MANDEL.BAS'}
    for source, name in samples.items():
        expected[name] = (basic / 'samples' / source).read_text().replace('\n', '\r\n').encode('ascii')
    smoke = (basic / 'samples/mandelbrot.bas').read_text()
    if smoke.count('STEP 4') != 2:
        raise ValueError('Mandelbrot smoke sample requires two STEP 4 loops')
    expected['MANSMOKE.BAS'] = smoke.replace('STEP 4', 'STEP 32').replace('\n', '\r\n').encode('ascii')
    expected['FILEIO.BAS'] = (basic / 'ports/pc98/samples/fileio.bas').read_text().replace('\n', '\r\n').encode('ascii')
    ipl = bytearray((dos_build / 'ipl.bin').read_bytes())
    struct.pack_into('<HH', ipl, ipl.index(b'COUNTS') + 6,
                     (len(expected['IO.SYS']) + 1023) // 1024,
                     (len(expected['MSDOS.SYS']) + 1023) // 1024)
    if files != expected or image[:1024] != ipl:
        raise ValueError('disk does not match the source builds and samples; rebuild before importing')
    destination = Path(__file__).resolve().parents[1] / 'public/msdos4'
    destination.mkdir(parents=True, exist_ok=True)
    name = f'msdos4-retrobasic-{sha256[:12]}.xdf'
    manifest.update(image=name, sources=sources, license='MIT')
    (destination / name).write_bytes(image)
    (destination / 'LICENSE.txt').write_bytes(notices)
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Imported {name}: MS-DOS {sources["msdos"]["commit"]}, RetroBasic {sources["retrobasic"]["commit"]}')
    print('Keep old image filenames available for saved disks and shared URLs.')


if __name__ == '__main__':
    main()
