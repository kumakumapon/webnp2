# KDESK/386 MZ integration

> Status: archived development/acceptance record. Preserved scope and baseline
> references are historical; use [the documentation index](https://github.com/kumakumapon/webnp2/blob/master/docs/README.md)
> for current supported behavior and the repository issues for active work.

Pair with MS-DOS `codex/kdesk-mz-executable`. Pin the tested native commit when
generating the ordinary and experimental images. Import KDESK.EXE/K386.EXE and
remove obsolete same-name COM entries from generated copies, preserving original
images, kernel bytes, provenance, licenses and browser-saved disks.

Validate MZ structure and relocated runtime segments, automatic startup, GUI
operations, foreground child EXEC/return and continued private V86 execution.
Keep all existing normal/K386 browser regression jobs, npm tests and build checks.
