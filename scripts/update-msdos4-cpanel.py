#!/usr/bin/env python3
"""Add CPANEL and optionally KDESK to the bundled DOS 4 PC-98 image."""
import argparse
import hashlib
import importlib.util
import json
import re
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
    parser.add_argument('--with-window', action='store_true', help='also build and add KDESK')
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
    notices = files['LICENSE.TXT']
    # Regenerate the appended application notices so repeated imports do not
    # duplicate them. The original kernel/filer/editor notices remain intact.
    for marker in (b'\r\nCPANEL license\r\n', b'\r\nKDESK license\r\n',
                   b'\r\nWIN98 license\r\n'):
        if marker in notices:
            notices = notices[:notices.index(marker)]
    notices += b'\r\nCPANEL license\r\n' + (control / 'LICENSE').read_bytes()

    apps = {
        'CPANEL.COM': (control / 'build/CPANEL.COM').read_bytes(),
        'CPANEL.TXT': (control / 'build/CPANEL.TXT').read_bytes(),
        'CPLIC.TXT': (control / 'build/CPLIC.TXT').read_bytes(),
    }
    if args.with_window:
        window = dos / 'tools/window'
        subprocess.run(['make', '-C', str(window), 'all'], check=True)
        apps.update({name: (window / 'build' / name).read_bytes()
                     for name in ('KDESK.COM', 'KDESK.TXT', 'KDLIC.TXT',
                                  'KVIEW.COM', 'KPAINT.COM', 'KIMAGE.TXT', 'COLORS.BMP')})
        verifier = (webnp2 / 'scripts/verify-window.mjs').read_bytes()
        if verifier != (window / 'verify-ui.mjs').read_bytes():
            raise ValueError('KDESK browser verifier does not match its source')
        manifest['window_verifier_sha256'] = digest(verifier)
    window_license = apps.get('KDLIC.TXT', files.get('KDLIC.TXT'))
    if window_license is not None:
        notices += b'\r\nKDESK license\r\n' + window_license
    elif not args.with_window and 'WINLIC.TXT' in files:
        notices += b'\r\nWIN98 license\r\n' + files['WINLIC.TXT']
    excluded = {
        'IO.SYS', 'MSDOS.SYS', 'COMMAND.COM', 'AUTOEXEC.BAT', 'DOSLIC.TXT',
        *apps,
    }
    if args.with_window:
        excluded.update(('WIN98.COM', 'WIN98.TXT', 'WINLIC.TXT'))
    extra = [(name, notices if name == 'LICENSE.TXT' else data)
             for name, data in files.items() if name not in excluded]
    extra.extend(apps.items())
    autoexec = files['AUTOEXEC.BAT']
    startup = b'ECHO CPANEL: System settings\r\n'
    if startup not in autoexec:
        autoexec += startup
    if args.with_window:
        autoexec = autoexec.replace(b'ECHO WIN98: Window desktop (type WIN98)\r\n', b'')
        startup = b'ECHO KDESK: Window desktop (type KDESK)\r\n'
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
    # Only these applications are rebuilt. Preserve the provenance of the
    # kernel, command shell, editor, filer and other bytes copied from the disk.
    components = [('control', 'CPANEL', 'tools/control')]
    if args.with_window:
        components.append(('window', 'Kuma Desktop', 'tools/window'))
    for key, component, path in components:
        sources[key] = {
            'component': component, 'repository': repository,
            'commit': commit, 'path': path, 'license': 'MIT',
        }
    manifest.update(
        image=f'msdos4-retrobasic-{sha256[:12]}.xdf',
        sha256=sha256, files=entries,
    )
    destination = manifest_path.parent
    (destination / manifest['image']).write_bytes(image)
    (destination / 'LICENSE.txt').write_bytes(notices)
    (destination / 'CPANEL.txt').write_bytes(apps['CPANEL.TXT'])
    if args.with_window:
        (destination / 'KDESK.txt').write_bytes(apps['KDESK.TXT'])
        (destination / 'KIMAGE.txt').write_bytes(apps['KIMAGE.TXT'])
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    for readme in (webnp2 / 'README.md', webnp2 / 'README.ja.md'):
        text = readme.read_text()
        updated = re.sub(r'msdos4-retrobasic-[0-9a-f]{12}\.xdf', manifest['image'], text)
        if updated != text:
            readme.write_text(updated)
    print(f"Updated {destination / manifest['image']} ({sha256})")


if __name__ == '__main__':
    main()
