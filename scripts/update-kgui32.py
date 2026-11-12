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

RELOCATED = ('KGCALC.EXE', 'KGCLOCK.EXE', 'KGFILES.EXE', 'KGEDIT.EXE',
             'COUNT32.EXE', 'ARGS32.EXE')

def application_hdd(root, destination, files):
    # Build offline from a NEW marked volume. No mounted/user image is opened.
    temporary = workspace_hdd(root, destination)
    image = bytearray((destination/temporary['image']).read_bytes())
    start = 256+264*256
    fat, rootdir, data = start+1024, start+41*1024, start+57*1024
    def link(cluster, value):
        for offset in (fat, fat+20*1024):
            struct.pack_into('<H', image, offset+cluster*2, value)
    link(4, 0xffff)
    entry = rootdir+64
    image[entry:entry+11] = b'APPS       '
    image[entry+11] = 16
    struct.pack_into('<HH', image, entry+24, 0x21, 4)
    directory = data+2*4096
    for offset, name, cluster in ((0,b'.          ',4),(32,b'..         ',0)):
        image[directory+offset:directory+offset+11] = name
        image[directory+offset+11] = 16
        struct.pack_into('<HH', image, directory+offset+24, 0x21, cluster)
    next_cluster = 5
    entries = []
    for index, name in enumerate(RELOCATED):
        content = files[name]
        count = (len(content)+4095)//4096
        first = next_cluster
        if first+count > 10118:
            raise ValueError('Application volume exceeds FAT16 capacity')
        for i in range(count):
            c = next_cluster; next_cluster += 1
            link(c, c+1 if i+1<count else 0xffff)
            at = data+(c-2)*4096
            image[at:at+min(4096,len(content)-i*4096)] = content[i*4096:(i+1)*4096]
        at = directory+(index+2)*32
        base, ext = name.split('.')
        image[at:at+11] = (base.ljust(8)+ext.ljust(3)).encode('ascii')
        image[at+11] = 33  # distribution applications are read-only
        struct.pack_into('<HHI', image, at+24, 0x21, first, len(content))
        entries.append({'name': 'APPS/'+name, 'bytes': len(content),
                        'sha256': hashlib.sha256(content).hexdigest()})
    sha = hashlib.sha256(image).hexdigest()
    name = f'apps-{sha[:12]}.thd'
    (destination/name).write_bytes(image)
    return {**temporary, 'image':name, 'sha256':sha,
            'initial_free_bytes': (10118-next_cluster)*4096, 'files':entries}

def fd_free(image):
    def get(c):
        value = struct.unpack_from('<H', image, 1024+c*3//2)[0]
        return value >> 4 if c & 1 else value & 4095
    return sum(not get(c) for c in range(2, 1223))*1024

def standalone_hdd(source, destination, app_hdd, files, autoexec):
    """Compose a separate bootable volume; keep the existing FD/data pair."""
    oem = source/'ports/pc98/hdd/build/oem/IO-HDD.SYS'
    if not oem.exists():
        raise ValueError('Build ports/pc98/hdd/oem.py before generating HDD boot media')
    selected = {n:d for n,d in files.items() if n not in RELOCATED}
    selected['IO.SYS'] = oem.read_bytes()
    selected['CONFIG.SYS'] = files['CONFIG.SYS'].replace(b'DEVICE=KHD98.SYS\r\n', b'')
    selected['AUTOEXEC.BAT'] = autoexec.replace(b'@ECHO OFF\r\n', b'@ECHO OFF\r\nSET COMSPEC=A:\\COMMAND.COM\r\nPATH A:\\;A:\\APPS\r\n', 1)
    selected['HDDTEST.EXE'] = (source/'ports/pc98/hdd/build/HDDTEST.EXE').read_bytes()
    builder = module('kgui_boot_hdd', source/'ports/pc98/hdd/boot_image.py')
    image, info = builder.compose((destination/app_hdd['image']).read_bytes(), selected,
        (source/'ports/pc98/hdd/build/boot1.bin').read_bytes(),
        (source/'ports/pc98/hdd/build/boot2.bin').read_bytes())
    sha = hashlib.sha256(image).hexdigest()
    name = f'hddboot-{sha[:12]}.thd'
    (destination/name).write_bytes(image)
    free = sum(struct.unpack_from('<H', image, builder.FAT+c*2)[0]==0
               for c in range(2,builder.CLUSTERS+2))*builder.CLUSTER
    return {**info, 'image':name, 'sha256':sha, 'bytes':len(image),
            'filesystem':'FAT16','logical_sector_bytes':1024,'initial_free_bytes':free,
            'disposable_volume_marker':'KHDPROOF','base_apps_hdd_sha256':app_hdd['sha256'],
            'applications':app_hdd['files'],'hdd_boot_supported':True,
            'oem':json.loads((oem.parent/'hdd-oem.json').read_text())}

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
    # K386's 70 KiB binary stress fixture is unrelated to the GUI. Keep its
    # original disk intact; reserve space here for recovery and FD Work.
    del files['DATA32.BIN']
    files['KHD98.SYS'] = (source/'ports/pc98/hdd/build/KHD98.SYS').read_bytes()
    files['HDDFLT.COM'] = (source/'ports/pc98/hdd/build/HDDFLT.COM').read_bytes()
    files['CONFIG.SYS'] += b'LASTDRIVE=E\r\nDEVICE=KHD98.SYS\r\n'
    for name in ('KGUILDR.EXE', 'KGUI32.EXE', 'KGPROOF.COM', 'KGCALC.EXE', 'KGCLOCK.EXE', 'KGBAD.EXE', 'KGFILES.EXE', 'KGDIRBAD.EXE', 'KGDIRNO.EXE', 'KGEDIT.EXE', 'KGSAVEB.EXE', 'KGSAVENO.EXE', 'KGSAVE64.EXE', 'KGRECNEG.EXE', 'KGRECNON.EXE'):
        files[name] = (source/'tools/kgui32/build'/name).read_bytes()
    files['VDOS.EXE'] = (source/'tools/k386/build/VDOS.EXE').read_bytes()
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
    app_hdd = application_hdd(root, destination, files)
    boot_hdd = standalone_hdd(source, destination, app_hdd, files, autoexec)
    compact_files = [(n,d) for n,d in files.items() if n not in excluded and n not in RELOCATED]
    compact, compact_entries = helper.make_image(original[:1024], files['IO.SYS'],
        compact_files, kernel=files['MSDOS.SYS'], command=files['COMMAND.COM'], autoexec=autoexec)
    compact_entries.append(add_workspace(compact))
    compact_sha = hashlib.sha256(compact).hexdigest()
    compact_name = f'kgui32-apps-{compact_sha[:12]}.xdf'
    (destination/compact_name).write_bytes(compact)
    distribution = {'image':compact_name,'sha256':compact_sha,'files':compact_entries,
                    'fd_free_bytes':fd_free(compact),'legacy_fd_free_bytes':fd_free(image),
                    'hdd':app_hdd,'directory':'APPS','relocated':list(RELOCATED),
                    'hdd_boot_supported':False}
    (destination/'manifest.json').write_text(json.dumps({
        'enabled':True,'experimental':True,'image':name,'sha256':sha,
        'source_commit':commit,'source_dirty':dirty,
        'base_image_sha256':base['sha256'],'omitted_base_fixtures':['DATA32.BIN'],'files':entries,'extended_memory_mb':16,
        'gui_bits':32,'dedicated_gui_context':True,'application_slots':2,
        'dos_files_read_only':False,'workspace_save_api':1,'workspace_information_api':1,
        'files_workspace_browser':1,'files_editor_launch':1,
        'v86_hdd_read_only':1,'v86_private_drives':1,
        'workspace_recovery_api':1,'editor_tools':['find','replace','shift-selection','lf-crlf','adaptive-viewport','recovery'],'keyboard_modifiers':1,
        'standalone_hdd':boot_hdd,'hdd_boot_supported':True,
        'application_distribution':distribution, 'workspace_hdd':hdd,'writable_workspace':'auto: verified HDD / WORK',
        'workspace_fd_fallback':'A:\\WORK','workspace_max_bytes':65536,'workspace_extension':'TXT','graphical_client_abi':1,'graphical_clients':['KGCALC.EXE','KGCLOCK.EXE','KGFILES.EXE','KGEDIT.EXE'],'widget_sdk':4,'directory_api':1,'root_browser_read_only':True,'compatibility':'independent PM32 desktop with two mixed clients; verified HDD workspace with explicit FD fallback, bounded ASCII editor saves and read-only A: root',
    },indent=2)+'\n')
    (destination/'LICENSE.txt').write_bytes(files['LICENSE.TXT']+b'\r\nKGUI32 original extension\r\n'+files['KGLIC.TXT'])
    print(f'Generated independent KGUI32 disk: {name} ({sha})')

if __name__ == '__main__':
    main()
