# Practical K38632 SDK

The experimental KDESK/386 disk now includes the ABI 0101h practical SDK.
Use the experimental boot choice with 16 MiB. Save GUI work and F10 to real DOS:

```
K32RUN ARGS32.EXE "two words" three
K32RUN HEAP32.EXE
K32RUN INPUT32.EXE
K32RUN FILE32.EXE
K32RUN VIEW32.EXE VIEWDATA.TXT
```

INPUT32 expects `a`, then `b`. VIEW32 previews an A: root 8.3 text file with
n/space/PageDown, p/PageUp, j/Down, k/Up, Home/End and q. Escape stops any owner.
The preview is bounded to 64 KiB / 1024 lines and never changes a file.
These remain standalone PM32 applications; they do not yet run as KDESK
windows or concurrently with V86. `KDESK` returns to the existing desktop.

The native implementation is separated into loader/ELF validation, pure SDK
policy (`services.c`), real-mode DOS/XMS/keyboard broker (`services-dos.c`),
and the existing protected execution engine. No DOS kernel or emulator change.
The SDK adds immutable startup information/argc/argv, feature discovery,
page-rounded owned heap within the existing 4 MiB budget, nonblocking PC-98 key
input with explicit wait state/deadline, and generation-checked read-only file
handles. Wait does not repeatedly dispatch the application or drain its budget;
it polls in real mode and is not a low-power idle implementation.

Only ASCII 8.3 regular files at A: root are accepted. Devices, directories,
paths, wildcard names and writes are rejected. Read validates every writable
user page, supports odd lengths without overwriting neighbors, and seek is
bounded by file size. At most eight files and 64 heap allocations. Normal exit,
Escape, fault and budget termination reclaim handles/pages/XMS and restore the
host. Legacy ABI 0100h applications keep their existing contract.

Build/pinning remains `bash scripts/prepare-msdos4-cpanel-ci.sh`: the native
commit is explicit, both generated manifests record it, and tests check their
agreement and image hashes. Generated disk bytes are build artifacts. Merge the
MS-DOS dependency first, wait for its **main branch CI** to finish successfully,
then merge this integration. Successful PR checks do not imply postmerge CI
or deployment has completed.

```
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k38632-services.mjs http://127.0.0.1:4173/webnp2/
```

The new CI job saves live/terminal guest CPU and page-table records, wait
counters, file/heap ownership counters and screenshots. It exercises actual
quoted arguments, zeroed heap reuse/exhaustion, invalid frees, real memory
faults, queued input and deadlines, 70001-byte file seeks/odd copies, stale
handles, token limits, pointer/device/path rejection, viewer scrolling and
normal/Escape/fault cleanup. It verifies whole-disk SHA-256 before/after and
an actual 4 MiB machine's refusal. Existing loader/PM32/V86/GUI regression jobs
remain enabled. See the pinned native `tools/k38632/SERVICES.md` for API,
startup layout, error codes and inspection offsets.
