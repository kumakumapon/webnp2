#!/usr/bin/env python3
"""Generate an independent native PM32 desktop disk, without changing other images."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import struct
import sys

def add_workspace(image):
    """Add an empty FAT12 directory without touching the original boot files."""
    def get(c):
        value = struct.unpack_from('<H', image, 1024+c*3//2)[0]
        return value >> 4 if c & 1 else value & 4095
    cluster = next(c for c in range(2, 1223) if not get(c))
    for start in (1024, 3072):
        at = start+cluster*3//2
        old = struct.unpack_from('<H', image, at)[0]
        struct.pack_into('<H', image, at, (old & 15) | 0xfff0 if cluster & 1 else (old & 0xf000) | 0xfff)
    root = next(at for at in range(5*1024, 11*1024, 32) if image[at] == 0)
    image[root:root+32] = bytes(32)
    image[root:root+11] = b'WORK       '
    image[root+11] = 16
    struct.pack_into('<HH', image, root+24, 0x21, cluster)
    at = (9+cluster)*1024
    image[at:at+1024] = bytes(1024)
    for offset, name, child in ((0, b'.          ', cluster), (32, b'..         ', 0)):
        image[at+offset:at+offset+11] = name
        image[at+offset+11] = 16
        struct.pack_into('<HH', image, at+offset+24, 0x21, child)
    return {'name':'WORK','size':0,'attributes':16,'sha256':hashlib.sha256(b'').hexdigest()}

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

def workspace_hdd(root, destination):
    """New data volume only; never open or format a user's saved image."""
    image = module('kgui_hdd', root/'scripts/update-pc98-hdd-proof.py').make_hdd()
    start = 256+264*256
    for fat in (start+1024, start+21*1024):
        struct.pack_into('<H', image, fat+3*2, 0xffff)
    entry = start+41*1024+32
    image[entry:entry+11] = b'WORK       '
    image[entry+11] = 16
    struct.pack_into('<HH', image, entry+24, 0x21, 3)
    directory = start+57*1024+4096
    for offset, name, cluster in ((0,b'.          ',3),(32,b'..         ',0)):
        image[directory+offset:directory+offset+11] = name
        image[directory+offset+11] = 16
        struct.pack_into('<HH', image, directory+offset+24, 0x21, cluster)
    sha = hashlib.sha256(image).hexdigest()
    name = f'workspace-{sha[:12]}.thd'
    (destination/name).write_bytes(image)
    return {'image':name,'sha256':sha,'bytes':len(image),'filesystem':'FAT16',
            'logical_sector_bytes':1024,'initial_free_bytes':10114*4096,
            'disposable_volume_marker':'KHDPROOF'}

def main():
    source = Path(sys.argv[1]).resolve()
    root = Path(__file__).resolve().parents[1]
    subprocess.run(['make', '-C', str(source/'tools/kgui32'), 'all'], check=True)
    subprocess.run(['make', '-C', str(source/'ports/pc98/hdd'), 'all'], check=True)
    base = json.loads((root/'public/k386/manifest.json').read_text())
    commit = subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
    dirty = bool(subprocess.check_output(['git','-C',str(source),'status','--porcelain'],text=True))
    if not base.get('enabled') or base.get('source_commit') != commit or base.get('source_dirty') != dirty:
        raise ValueError('Regenerate the base K386 image from the same native source first')
    original = (root/'public/k386'/base['image']).read_bytes()
    assert hashlib.sha256(original).hexdigest() == base['sha256']
    up = module('kgui32_files', root/'scripts/update-msdos4-cpanel.py')
    files = up.disk_files(original)
    files['KHD98.SYS'] = (source/'ports/pc98/hdd/build/KHD98.SYS').read_bytes()
    files['HDDFLT.COM'] = (source/'ports/pc98/hdd/build/HDDFLT.COM').read_bytes()
    files['CONFIG.SYS'] += b'LASTDRIVE=E\r\nDEVICE=KHD98.SYS\r\n'
    for name in ('KGUILDR.EXE', 'KGUI32.EXE', 'KGPROOF.COM', 'KGCALC.EXE', 'KGCLOCK.EXE', 'KGBAD.EXE', 'KGFILES.EXE', 'KGDIRBAD.EXE', 'KGDIRNO.EXE', 'KGEDIT.EXE', 'KGSAVEB.EXE', 'KGSAVENO.EXE', 'KGSAVE64.EXE'):
        files[name] = (source/'tools/kgui32/build'/name).read_bytes()
    files['KGLIC.TXT'] = (source/'tools/kgui32/LICENSE').read_bytes()
    files['BROWSE.TXT'] = b''.join(f'BROWSER LINE {i:04d} - read-only preview\r\n'.encode('ascii') for i in range(1800))
    files['LINES.TXT'] = b'\n'*9000+b'FINAL LINE\n'
    files['EMPTY.TXT'] = b''
    files['EDITTEST.TXT'] = b'EDITOR FIXTURE\r\nSecond line\r\n'
    files['BINARY.TXT'] = bytes(range(256))
    autoexec = b'@ECHO OFF\r\nECHO KGUI32 independent desktop\r\nK386.EXE\r\nK32HOST.EXE\r\nKGUILDR.EXE\r\nECHO DOS fallback: type KDESK\r\n'
    helper = module('kgui32_image', source/'ports/pc98/image.py')
    excluded = {'IO.SYS','MSDOS.SYS','COMMAND.COM','AUTOEXEC.BAT','DOSLIC.TXT'}
    image, entries = helper.make_image(original[:1024], files['IO.SYS'],
        [(name,data) for name,data in files.items() if name not in excluded],
        kernel=files['MSDOS.SYS'],command=files['COMMAND.COM'],autoexec=autoexec)
    entries.append(add_workspace(image))
    sha = hashlib.sha256(image).hexdigest()
    destination = root/'public/kgui32'
    destination.mkdir(exist_ok=True)
    hdd = workspace_hdd(root, destination)
    name = f'kgui32-{sha[:12]}.xdf'
    (destination/name).write_bytes(image)
    (destination/'manifest.json').write_text(json.dumps({
        'enabled':True,'experimental':True,'image':name,'sha256':sha,
        'source_commit':commit,'source_dirty':dirty,
        'base_image_sha256':base['sha256'],'files':entries,'extended_memory_mb':16,
        'gui_bits':32,'dedicated_gui_context':True,'application_slots':2,
        'dos_files_read_only':False,'workspace_save_api':1,'workspace_information_api':1,
        'workspace_hdd':hdd,'writable_workspace':'auto: verified HDD / WORK',
        'workspace_fd_fallback':'A:\\WORK','workspace_max_bytes':65536,'workspace_extension':'TXT','graphical_client_abi':1,'graphical_clients':['KGCALC.EXE','KGCLOCK.EXE','KGFILES.EXE','KGEDIT.EXE'],'widget_sdk':4,'directory_api':1,'root_browser_read_only':True,'compatibility':'independent PM32 desktop with two mixed clients; verified HDD workspace with explicit FD fallback, bounded ASCII editor saves and read-only A: root',
    },indent=2)+'\n')
    (destination/'LICENSE.txt').write_bytes(files['LICENSE.TXT']+b'\r\nKGUI32 original extension\r\n'+files['KGLIC.TXT'])
    print(f'Generated independent KGUI32 disk: {name} ({sha})')

if __name__ == '__main__':
    main()
