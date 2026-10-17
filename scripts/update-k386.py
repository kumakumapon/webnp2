#!/usr/bin/env python3
"""Build a separate experimental disk; the ordinary DOS image is unchanged."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def main():
    source = Path(sys.argv[1]).resolve()
    root = Path(__file__).resolve().parents[1]
    subprocess.run(['make', '-C', str(source / 'tools/k386'), 'all'], check=True)
    manifest = json.loads((root / 'public/msdos4/manifest.json').read_text())
    original = (root / 'public/msdos4' / manifest['image']).read_bytes()
    assert hashlib.sha256(original).hexdigest() == manifest['sha256']
    up = module('k386_disk_reader', root / 'scripts/update-msdos4-cpanel.py')
    files = up.disk_files(original)
    names = ('K386.COM', 'K386CPU.COM', 'K386TEST.COM', 'COUNTER.COM', 'ECHO.COM', 'FAULT.COM', 'KFILE.COM', 'PORT.COM', 'DF.COM', 'FPU.COM')
    for name in names:
        files[name] = (source / 'tools/k386/build' / name).read_bytes()
    files['K386.TXT'] = (source / 'tools/k386/DESIGN.md').read_bytes().replace(b'\n', b'\r\n')
    files['KDATA.TXT'] = b'READ ONLY DATA\r\n'
    files['K386LIC.TXT'] = (source / 'tools/k386/LICENSE').read_bytes()
    files['LICENSE.TXT'] += b'\r\nK386 original extension\r\n' + files['K386LIC.TXT']
    # Explicitly isolated boot profile: no EMM386/XMS protected-mode owner.
    files['CONFIG.SYS'] = b'FILES=30\r\nBUFFERS=10\r\n'
    autoexec = b'@ECHO OFF\r\nECHO KDESK/386 experimental V86 COM sessions\r\nK386\r\nKDESK\r\n'
    helper = module('k386_pc98_image', source / 'ports/pc98/image.py')
    excluded = {'IO.SYS', 'MSDOS.SYS', 'COMMAND.COM', 'AUTOEXEC.BAT', 'DOSLIC.TXT'}
    image, entries = helper.make_image(original[:1024], files['IO.SYS'],
        [(name, data) for name, data in files.items() if name not in excluded],
        kernel=files['MSDOS.SYS'], command=files['COMMAND.COM'], autoexec=autoexec)
    sha = hashlib.sha256(image).hexdigest()
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    destination = root / 'public/k386'
    destination.mkdir(exist_ok=True)
    name = f'kdesk386-{sha[:12]}.xdf'
    (destination / name).write_bytes(image)
    (destination / 'manifest.json').write_text(json.dumps({
        'enabled': True, 'experimental': True, 'image': name, 'sha256': sha,
        'source_commit': commit, 'base_image_sha256': manifest['sha256'],
        'files': entries, 'dos_files_read_only': True,
        'compatibility': 'experimental V86 COM services; not a complete virtual DOS machine',
    }, indent=2) + '\n')
    (destination / 'LICENSE.txt').write_bytes(files['LICENSE.TXT'])
    (destination / 'K386.txt').write_bytes(files['K386.TXT'])
    print(f'Generated experimental K386 disk: {name} ({sha})')


if __name__ == '__main__':
    main()
