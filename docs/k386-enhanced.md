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
