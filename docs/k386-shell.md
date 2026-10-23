# Guest DOS windows and shell

Opening DOS 1/2 in the experimental profile now starts the original `KSH.EXE`
inside its V86 context. A fresh text buffer contains spaces; control bytes also
render blank. This fixes the rows of `?` caused by drawing uninitialized NULs.
The shell and program execution belong to the PC-98 guest, using the existing
NP2kai CPU. No browser command interpreter or HTML task windows are involved.

## Commands

Select **KDESK/386 (experimental)** after generating the images. Ctrl+N opens
DOS 1; Ctrl+O opens DOS 2. At either `A:\>` prompt:

```text
HELP
VER
DIR *.COM
TYPE KDATA.TXT
CD DIRECTORY
CD \
ECHO HELLO
CLS
TIME
MZTEST HELLO
FLAGS
COUNTER
```

Commands are ASCII and filenames use A: DOS paths. The shell tries `.COM`, then
`.EXE` for an external name without an extension. `COUNTER` runs until `q`;
the other window remains usable. On normal exit or a contained child fault,
the same parent shell returns. `EXIT` ends the shell. Files are read-only.
CD and directory-search state are private to each session; host DOS's current
directory and DTA are restored. The viewport follows new console output.
One directory search per process is active at a time. Its reserved 21-byte DTA
continuation must match a broker-issued result; modified drive/network/cluster
state is rejected before host DOS is called. Child EXEC saves the parent's
trusted search continuation and restores it on return.

Ctrl+L / Run replaces the selected session's root program, accepting a path and
arguments, for example `MZTEST.EXE DIRECT` or `KSH.EXE` to restart the shell.
Ctrl+P / Ctrl+R / Ctrl+E pause, resume or end a session. Ctrl+T opens Tasks.
Closing a window ends its session. Function keys and Tab remain KDESK controls;
Escape is forwarded to the guest unless editing the GUI Run field.

## Execution boundary

The current XMS-backed memory, four-level EXEC, inherited handles, private BIOS
interval timers and original COMMAND probes are described in the
[process compatibility guide](k386-processes.md). COM supports FF00h bytes;
MZ allocations are bounded by the private DOS arena. General DOS/BIOS/TSR,
disk writes and direct graphics/port I/O remain incomplete. Use the experimental
FDXMS286 profile with 16MiB extended memory and no EMM386. The ordinary profile
retains its drivers and KDESK fallback. Foreground launcher EXECs pause VM quanta.

## Build and actual-browser validation

`scripts/prepare-msdos4-cpanel-ci.sh` pins the native source commit. The importer
copies the unchanged kernel/COMMAND from the baseline image and creates a
separate hashed experimental image with its own manifest and license notices.
Tracked experimental manifests remain placeholders until CI generates the images.

```sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k386-shell.mjs http://127.0.0.1:4173/webnp2/ test-results/k386-shell
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k386.mjs http://127.0.0.1:4173/webnp2/ test-results/k386
```

The shell suite checks visible initial prompts, a 126-character command, private
input/cwd/DTA, rejected reserved search-state edits, actual relocated MZ bytes
and PSP arguments, virtual flags and
IRET, child fault/return, two background children, and an interactive parent
while the other child continues. Invalid MZ must preserve the running program.
CPU frames, CR3/PTE and physical RAM are inspected, not simulated task counters.

Native DOS creates a directory fixture on the browser's disposable disk. The
suite records its prepared whole-disk SHA-256, requires all later VM services
to leave it byte-identical, checks the fixture contents, and independently
checks the original distributed image hash. The separate core suite requires
the original disk hash throughout. Both output JSON evidence and screenshots.
The normal-image browser suite still covers the existing desktop and tools.

PRs: [MS-DOS #17](https://github.com/kumakumapon/MS-DOS/pull/17),
[webnp2 #17](https://github.com/kumakumapon/webnp2/pull/17).
They remain drafts while full DOS-machine acceptance is incomplete. Final
source/hash/compiler-specific results are recorded there and in CI artifacts.
