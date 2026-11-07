#!/usr/bin/env python3
"""Build an opt-in FD plus marked, disposable 40 MB FAT16 HDD proof volume."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def make_hdd():
    # Same standard T98 SASI geometry as createFormattedHdd(), but 1024-byte
    # logical sectors to respect the DOS4 OEM's existing MAXSEC=1024 contract.
    image=bytearray(256+615*8*33*256)
    struct.pack_into('<H',image,0,615)
    disk=256;image[disk:disk+8]=b'\xeb\x0a\x90\x90IPL1';image[disk+254:disk+256]=b'\x55\xaa'
    p=disk+256;image[p:p+2]=b'\xa1\x91'
    struct.pack_into('<H',image,p+6,1);struct.pack_into('<H',image,p+10,1);struct.pack_into('<H',image,p+14,614)
    image[p+16:p+32]=b'KHDPROOF        '
    start=disk+264*256;boot=memoryview(image)[start:start+1024]
    boot[:3]=b'\xeb\xfe\x90';boot[3:11]=b'KHDPRF01'
    struct.pack_into('<HBHBHHBHHHII',boot,11,1024,4,1,2,512,40524,0xf8,20,33,8,66,0)
    boot[38]=0x29;boot[43:54]=b'KHDPROOF   ';boot[54:62]=b'FAT16   ';boot[510:512]=b'\x55\xaa'
    for f in (start+1024,start+21*1024):struct.pack_into('<HHH',image,f,0xfff8,0xffff,0xffff)
    root=start+41*1024;image[root:root+11]=b'HDD     ID ';image[root+11]=32
    struct.pack_into('<HHI',image,root+24,0x21,2,8)
    data=start+57*1024;image[data:data+8]=b'KHDPROOF'
    last=start+40523*1024;image[last:last+15]=b'HDD LAST SECTOR'
    return image

def main():
    source=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parents[1]
    subprocess.run(['make','-C',str(source/'ports/pc98/hdd'),'all','test'],check=True)
    m=json.loads((root/'public/msdos4/manifest.json').read_text());original=(root/'public/msdos4'/m['image']).read_bytes()
    assert hashlib.sha256(original).hexdigest()==m['sha256']
    files=load('hdd_files',root/'scripts/update-msdos4-cpanel.py').disk_files(original)
    helper=load('hdd_fd',source/'ports/pc98/image.py')
    config=b'FILES=40\r\nBUFFERS=8\r\nLASTDRIVE=E\r\nDEVICE=KHD98.SYS\r\n'
    auto=b'@ECHO OFF\r\nECHO PC98 HDD basic I/O proof\r\nHDDTEST R\r\n'
    image,entries=helper.make_image(original[:1024],files['IO.SYS'],[
        ('CONFIG.SYS',config),('KHD98.SYS',(source/'ports/pc98/hdd/build/KHD98.SYS').read_bytes()),
        ('HDDTEST.EXE',(source/'ports/pc98/hdd/build/HDDTEST.EXE').read_bytes()),
        ('HDDLIC.TXT',(source/'LICENSE').read_bytes())],kernel=files['MSDOS.SYS'],command=files['COMMAND.COM'],autoexec=auto)
    out=root/'public/hdd-proof';out.mkdir(exist_ok=True)
    def save(prefix,ext,data):
        sha=hashlib.sha256(data).hexdigest();name=f'{prefix}-{sha[:12]}.{ext}';(out/name).write_bytes(data);return {'image':name,'sha256':sha,'bytes':len(data)}
    fd=save('dos4-hdd','xdf',image);hdd=save('data-hdd','thd',make_hdd())
    commit=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
    dirty=bool(subprocess.check_output(['git','-C',str(source),'status','--porcelain'],text=True))
    manifest={'enabled':True,'experimental':True,'source_commit':commit,'source_dirty':dirty,'base_fd_sha256':m['sha256'],'base_files_sha256':{name:hashlib.sha256(files[name]).hexdigest() for name in ('IO.SYS','MSDOS.SYS','COMMAND.COM')},'fd':fd,'hdd':hdd,'files':entries,'physical_sector_bytes':256,'logical_sector_bytes':1024,'partition_logical_sectors':40524,'filesystem':'FAT16','disposable_volume_marker':'KHDPROOF','hdd_boot_supported':False,'kgui32_workspace_routed':False}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'fd':fd,'hdd':hdd,'source':commit,'dirty':dirty}))

if __name__=='__main__':main()
