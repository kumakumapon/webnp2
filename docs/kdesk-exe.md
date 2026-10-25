# KDESK/386 DOS EXE layout

The generated ordinary image starts `KDESK.EXE`. The experimental image starts
`K386.EXE` followed by `KDESK.EXE`. The commands `KDESK` and `K386` also work;
newly generated images omit obsolete same-name COM files to avoid DOS's COM-first
search order. Previously saved disks are not rewritten.

These are DOS MZ executables. KDESK has independent code and data/stack segments;
DOS applies the data-segment relocation and provides a separate PSP. Each near
segment still has a 64 KiB limit. The linker reserves 12 KiB of stack and the MZ
header requests only the required memory. This is not Windows PE format or a
conversion to a flat 32-bit application.

K386 keeps its existing combined 64 KiB real/protected-mode monitor layout. Its
EXE startup and resident allocation account for the separate PSP, and DOS file
broker calls select that PSP as their owner. It remains resident until reboot.
The existing XMS/EMM386 and guest DOS/BIOS compatibility limits still apply.

Child EXEC, clipboard/mouse inheritance and return to KDESK use the correct PSP
and segment bounds. The [native desktop tools](kdesk-native-tools.md), including the image viewer/editor, also use MZ executables. See
[window controls](kdesk-interface.md) and [K386 limits](k386-enhanced.md).

Build with `make -C tools/window all test` and `make -C tools/k386 all test` in
the pinned MS-DOS checkout. `bash scripts/prepare-msdos4-cpanel-ci.sh` imports
both EXEs into generated copies of the ordinary and experimental disks. The
manifests record source commits and image/file hashes; the original kernel bytes
and notices remain intact.
