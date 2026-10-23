# KDESK/386 Enhanced (experimental)

Guest scheduling priorities, CPU budgets, resource diagnostics and interruption:
[K386 resource control](k386-resources.md).

This is a guest-side implementation. The browser only loads an explicitly
selected experimental disk and provides ordinary PC-98 hardware/input/debugging.
It does not implement DOS tasks in HTML windows or change the NP2kai CPU core.

The current boundary is two isolated **V86 COM/MZ execution sessions**, using a
subset of DOS console/time/read-only file services through a serialized real-mode
broker. General COMMAND.COM compatibility, a fully virtualized DOS kernel
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
- Ctrl+L / Run: replace the root program with a COM/MZ path and arguments;
  Escape cancels path entry. Each new window automatically starts `KSH.EXE`.
- Ctrl+P / Pause, Ctrl+R / Resume, Ctrl+E / End: control the selected VM.
- DOS window arrows/track/thumb and Page Up/Down: vertical viewport; `<` / `>`
  buttons: horizontal viewport. Move/resize/minimize/restore use normal controls.
- Ordinary ASCII keys go to the active DOS window. Escape goes to its program;
  the title close button ends that session. KDESK function keys/Tab stay reserved.

At the `A:\>` prompts, type `COUNTER` in both DOS windows to observe independent
background execution. `q` returns to each saved parent shell. KSH also provides
HELP/VER/DIR/TYPE/CD/ECHO/CLS/TIME/EXIT and external COM/small MZ execution.
See [shell usage and exact limits](k386-shell.md).
`ECHO.EXE` waits for input and exits on Escape. `KFILE.EXE` demonstrates a real
DOS read and denial of file writes/creation. `FAULT.EXE` and `PORT.EXE` deliberately
fault inside an isolated VM and are test programs. Run these through a DOS window.
External tools launched through the ordinary launcher still use foreground EXEC;
while such a tool runs, GUI-driven VM quanta pause.

## Architecture and limits

`tools/k386/DESIGN.md` in the pinned MS-DOS source specifies the mailbox, GDT/IDT,
TSS, page ownership, CPU/segment preservation, timer/EMM386 guards and file broker.
The monitor requires real mode and a masked, unowned IRQ0. It does not coexist
with an existing EMM386/V86 owner. The experimental profile loads FDXMS286 and selects 16MiB extended memory,
without EMM386; the normal profile is preserved. Each VM has XMS-backed private
conventional RAM and TVRAM, with a trusted DOS paragraph allocator, PSP and
copied environment. Four EXEC process levels retain parent memory and inherit
read-only handles. PC-98 BIOS interval callbacks can wake an input-waiting VM
and respect virtual IF; full PIC/PIT/IRQ virtualization remains incomplete.
See the [process compatibility guide](k386-processes.md) for the current limits.
The monitor is resident until reboot; ending sessions releases their XMS backing.
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
`scripts/verify-k386-shell.mjs` additionally checks visible shell prompts, full
command lines, private cwd/DTA, actual relocated MZ bytes, EXEC/parent return and
virtual flags/IRET. Prepared fixture disk hashes and the original distributed
image are checked independently. The existing full desktop, image, calculator/clock,
clipboard, persistence,
Japanese-input, DOS memory and normal boot suites remain required.

## Verification record and incomplete acceptance

The original PM/V86 implementation was merged in PR #16 in each repository.
Continuation [MS-DOS #17](https://github.com/kumakumapon/MS-DOS/pull/17) and
[webnp2 #17](https://github.com/kumakumapon/webnp2/pull/17) fixes initial `?` cells
and adds the guest shell, bounded MZ loader, one-level EXEC, private directory
state and virtual flags. Final source/image hashes and browser/CI evidence are
recorded on those PRs and in their artifacts. Each generated manifest identifies
its source and bytes; builds with different GCC versions can have different hashes.

| Requested feature | State |
| --- | --- |
| Internal task queues, IDs, states and task manager | Implemented and tested |
| PM/V86, paging, timer preemption, exception containment | Implemented and tested |
| Two private contexts, retained state and background progress | Implemented and tested |
| Guest DOS windows, focus, native window operations, GUI coexistence | Implemented and tested |
| KSH, bounded COM/MZ, four EXEC levels, private DOS allocator and virtual flags/IRET | Implemented; browser regression required in CI |
| Private input/cwd/DTA and read-only files | Implemented; whole-disk integrity checked in CI |
| Two DOS sessions with general DOS/BIOS compatibility | **Unimplemented** |
| Original COMMAND.COM VER/ECHO and external COM execution | Implemented; full DOS/BIOS compatibility incomplete |
| Full virtual interrupt delivery, TSRs and direct graphics virtualization | **Unimplemented** |
| Shared disk writes | **Unavailable**; explicitly denied |

Completing the remaining DOS-session requirements needs a DOS/BIOS and device
virtualization layer. CPU-mode transitions alone do not provide those services.
Keep the continuation PRs in draft until those acceptance conditions are met.

Continuation [MS-DOS #18](https://github.com/kumakumapon/MS-DOS/pull/18) and
[webnp2 #18](https://github.com/kumakumapon/webnp2/pull/18) add XMS private RAM,
DOS memory/PSP/environment, nested processes, inherited handles, BIOS interval
timers and original COMMAND probes. The process E2E adds actual per-level CPU
contexts, memory cookies and firmware-write faults; CI records final evidence.
