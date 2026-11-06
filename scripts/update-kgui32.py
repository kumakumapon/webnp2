#!/usr/bin/env python3
"""Generate an independent native PM32 desktop disk, without changing other images."""
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
    subprocess.run(['make', '-C', str(source/'tools/kgui32'), 'all'], check=True)
    base = json.loads((root/'public/k386/manifest.json').read_text())
    commit = subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
    dirty = bool(subprocess.check_output(['git','-C',str(source),'status','--porcelain'],text=True))
    if not base.get('enabled') or base.get('source_commit') != commit or base.get('source_dirty') != dirty:
        raise ValueError('Regenerate the base K386 image from the same native source first')
    original = (root/'public/k386'/base['image']).read_bytes()
    assert hashlib.sha256(original).hexdigest() == base['sha256']
    up = module('kgui32_files', root/'scripts/update-msdos4-cpanel.py')
    files = up.disk_files(original)
    for name in ('KGUILDR.EXE', 'KGUI32.EXE', 'KGPROOF.COM', 'KGCALC.EXE', 'KGCLOCK.EXE', 'KGBAD.EXE', 'KGFILES.EXE', 'KGDIRBAD.EXE', 'KGDIRNO.EXE'):
        files[name] = (source/'tools/kgui32/build'/name).read_bytes()
    files['KGLIC.TXT'] = (source/'tools/kgui32/LICENSE').read_bytes()
    files['BROWSE.TXT'] = b''.join(f'BROWSER LINE {i:04d} - read-only preview\r\n'.encode('ascii') for i in range(1800))
    files['LINES.TXT'] = b'\n'*9000+b'FINAL LINE\n'
    files['EMPTY.TXT'] = b''
    files['BINARY.TXT'] = bytes(range(256))
    autoexec = b'@ECHO OFF\r\nECHO KGUI32 independent desktop\r\nK386.EXE\r\nK32HOST.EXE\r\nKGUILDR.EXE\r\nECHO DOS fallback: type KDESK\r\n'
    helper = module('kgui32_image', source/'ports/pc98/image.py')
    excluded = {'IO.SYS','MSDOS.SYS','COMMAND.COM','AUTOEXEC.BAT','DOSLIC.TXT'}
    image, entries = helper.make_image(original[:1024], files['IO.SYS'],
        [(name,data) for name,data in files.items() if name not in excluded],
        kernel=files['MSDOS.SYS'],command=files['COMMAND.COM'],autoexec=autoexec)
    sha = hashlib.sha256(image).hexdigest()
    destination = root/'public/kgui32'
    destination.mkdir(exist_ok=True)
    name = f'kgui32-{sha[:12]}.xdf'
    (destination/name).write_bytes(image)
    (destination/'manifest.json').write_text(json.dumps({
        'enabled':True,'experimental':True,'image':name,'sha256':sha,
        'source_commit':commit,'source_dirty':dirty,
        'base_image_sha256':base['sha256'],'files':entries,'extended_memory_mb':16,
        'gui_bits':32,'dedicated_gui_context':True,'application_slots':2,
        'dos_files_read_only':True,'graphical_client_abi':1,'graphical_clients':['KGCALC.EXE','KGCLOCK.EXE','KGFILES.EXE'],'widget_sdk':2,'directory_api':1,'root_browser_read_only':True,'compatibility':'independent PM32 desktop with two mixed text/graphical client windows and widget SDK 2/root browser; ASCII, bounded RGB commands, read-only files',
    },indent=2)+'\n')
    (destination/'LICENSE.txt').write_bytes(files['LICENSE.TXT']+b'\r\nKGUI32 original extension\r\n'+files['KGLIC.TXT'])
    print(f'Generated independent KGUI32 disk: {name} ({sha})')

if __name__ == '__main__':
    main()
