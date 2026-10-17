# KDESK/386 Enhanced (experimental)

This is a guest-side implementation. The browser only loads an explicitly
selected experimental disk and provides ordinary PC-98 hardware/input/debugging.
It does not implement DOS tasks in HTML windows or change the NP2kai CPU core.

The current boundary is two isolated **V86 COM execution sessions**, using a
subset of DOS console/time/read-only file services through a serialized real-mode
broker. General COMMAND.COM/MZ EXE compatibility, a fully virtualized DOS kernel
and BIOS, resident drivers, shared writes and direct graphics I/O are unfinished.
The development PRs remain drafts until the requested complete DOS-session
acceptance is met. A passing experimental test is not a claim of full DOS-machine
compatibility.

## Use

After generating the images, select **KDESK/386 (experimental)**. K386 and KDESK
start automatically. The normal MS-DOS 4.0 image keeps its XMS/EMS configuration
and ordinary KDESK fallback.

- Ctrl+T / Tasks: task manager, with task IDs/states and Switch/Stop/Start/End.
- Ctrl+N / Ctrl+O: DOS 1 / DOS 2 windows.
- Ctrl+L / Run: type a COM path and press Enter; Escape cancels path entry.
- Ctrl+P / Pause, Ctrl+R / Resume, Ctrl+E / End: control the selected VM.
- DOS window arrows/track/thumb and Page Up/Down: vertical viewport; `<` / `>`
  buttons: horizontal viewport. Move/resize/minimize/restore use normal controls.
- Ordinary ASCII keys go to the active DOS window. Escape goes to its program;
  the title close button ends that session. KDESK function keys/Tab stay reserved.

Run `COUNTER.COM` in both DOS windows to observe independent background execution.
`ECHO.COM` waits for input and exits on Escape. `KFILE.COM` demonstrates a real
DOS read and denial of file writes/creation. `FAULT.COM` and `PORT.COM` deliberately
fault inside an isolated VM and are test programs. Run these through a DOS window.
External tools launched through the ordinary launcher still use foreground EXEC;
while such a tool runs, GUI-driven VM quanta pause.

## Architecture and limits

`tools/k386/DESIGN.md` in the pinned MS-DOS source specifies the mailbox, GDT/IDT,
TSS, page ownership, CPU/segment preservation, timer/EMM386 guards and file broker.
The monitor requires real mode and a masked, unowned IRQ0. It does not coexist
with an existing EMM386/V86 owner. The experimental boot profile omits XMS/EMS
loaders; the normal profile is preserved. Session memory uses DOS-owned conventional
blocks, so available memory limits foreground tools and guest COM sizes (60 KiB).
The monitor is resident until reboot; ending sessions releases their allocations.
Only general/segment registers, flags and stack are saved. x87/SIMD context
virtualization is not implemented; CR0 EM/TS/MP contains FPU instructions as a
per-session #NM instead of sharing that hardware state.

## Build and validation

The existing pinned-source importer now also runs `scripts/update-k386.py`.
It clones the generated normal image into a separate hashed image, preserves
kernel/COMMAND bytes and licenses, adds K386/probe/test programs, and writes its
own manifest and source commit. The tracked `public/k386/manifest.json` is a
disabled placeholder; CI builds the actual image before enabling the boot link.
No existing image or saved browser disk is overwritten.

```sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-k386.mjs http://127.0.0.1:4173/webnp2/ test-results/k386
```

The Playwright suite inspects guest CPU-generated mode/exception records,
private physical pages/CR3s/register frames/screens, continued background
execution, input focus, window lifecycle, isolated memory/I/O faults,
restart, serialized read-only files and the unchanged exported disk hash.
The existing full desktop, image, calculator/clock, clipboard, persistence,
Japanese-input, DOS memory and normal boot suites remain required.

## Verification record and incomplete acceptance

The local Playwright run on native commit
`40ee404ade6ec3758f2f721fa0b592176d0b5e91` passed the complete experimental suite
in Chromium 151.0.7922.173. Its generated image SHA-256 was
`46b3283210b2e40e24b683363a428547fe6eaf33d6295249624e4cc24a54b78c`.
The test inspected CPU-written PM/V86/exception records and actual physical
PTE/counter values, not host-simulated task progress. It also exercised an existing
DOS COM (`P98TEST.COM`), guest direction-flag preservation, rejected device paths,
read-only file services and a byte-identical disk export after all sessions ended.
Builds with a different GCC may produce a different image hash; each generated
manifest and test result identifies its own source and bytes.
Subsequent boundary hardening adds zero-length DOS line input at private offset
FFFEh and explicit FPU/#NM containment. The E2E now also checks Calculator,
Clock and Memo while both V86 contexts run; final pinned results are in the PR.

`npm test`: 486 passed, 2 existing skips. Production build passes. The separate
normal-image suite and GitHub CI results are recorded on the two draft PRs:
[MS-DOS #16](https://github.com/kumakumapon/MS-DOS/pull/16) and
[webnp2 #16](https://github.com/kumakumapon/webnp2/pull/16).

| Requested feature | State |
| --- | --- |
| Internal task queues, IDs, states and task manager | Implemented and tested |
| PM/V86, paging, timer preemption, exception containment | Implemented and tested |
| Two private COM contexts, retained state and background progress | Implemented and tested |
| Guest DOS windows, focus, native window operations, GUI coexistence | Implemented and tested |
| Disk safety | Read-only broker tested; shared writes intentionally denied |
| Two complete independently booted DOS environments | **Unimplemented** |
| General COMMAND.COM / MZ EXE / DOS and BIOS compatibility | **Unimplemented** |
| Full virtual interrupt delivery, TSRs and direct graphics virtualization | **Unimplemented** |

Completing the remaining DOS-session requirements needs a DOS/BIOS and device
virtualization layer, including process/PSP/EXEC state and virtual interrupt
delivery. CPU-mode transitions alone do not provide those services. Keep the PRs
in draft until those acceptance conditions are met.
