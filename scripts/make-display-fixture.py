#!/usr/bin/env python3
"""Build a disposable display test disk from an existing generated DOS image."""
import importlib.util
from pathlib import Path
import sys

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result

root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]).resolve()
base=Path(sys.argv[2]).resolve()
output=Path(sys.argv[3]).resolve()
reader=module('display_disk_reader',root/'scripts/update-msdos4-cpanel.py')
writer=module('display_disk_writer',source/'ports/pc98/image.py')
raw=base.read_bytes();files=reader.disk_files(raw)
files['KDISP.COM']=(source/'tools/display/build/KDISP.COM').read_bytes()
for name in ('KDESK.EXE','KVIEW.COM','KPAINT.COM'):
    files[name]=(source/'tools/window/build'/name).read_bytes()
skip={'IO.SYS','MSDOS.SYS','COMMAND.COM','AUTOEXEC.BAT','DOSLIC.TXT'}
image,_=writer.make_image(raw[:1024],files['IO.SYS'],[(n,d) for n,d in files.items() if n not in skip],kernel=files['MSDOS.SYS'],command=files['COMMAND.COM'],autoexec=(b'@ECHO OFF\r\n' if '--probe-only' in sys.argv[4:] else files['AUTOEXEC.BAT']))
output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(image)
