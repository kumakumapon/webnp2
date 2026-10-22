# KDESK 1.8: appearance and window navigation

The normal MS-DOS 4 image and the experimental KDESK/386 image share this native
PC-98 interface. The guest draws the navy background, white content surfaces,
blue active title, heavier CG-ROM title lettering and gold selection markers.
The 16-color fallback and 256-color PEGC renderer use the same UI semantics.

All open windows now share one taskbar at the bottom. Buttons compact when
windows close; each stays reachable even with all ten windows open. Click a
button to focus or restore it, or click the active window's button to minimize.
A muted underline indicates a minimized window and gold marks the active one.

The title controls are `_` minimize, `+` maximize, `=` restore and `x` close.
Double-click the title or use Ctrl+G to maximize/restore. The previous size and
pixel position return exactly; text and DOS execution are retained, and scroll
ranges adjust to the viewport size.
Restore before dragging a maximized window. F6/F7 restore first and then enter
the existing keyboard move/resize mode. The menu and taskbar stay accessible.
Ctrl+G is reserved by KDESK, including while a DOS window is focused.

On the experimental image, click either desktop DOS icon to open its KSH session.
Ctrl+N / Ctrl+O remain available when other windows cover these icons. Window
operations do not restart the guest or replace its private RAM. Both sessions
continue while other apps are active, subject to their existing pause/CPU limits.

`scripts/verify-kdesk-interface.mjs` uses Playwright with both real DOS images.
It checks pixel-exact restore after a sub-cell drag, keyboard and mouse title
controls, compact taskbar operation, all ten windows, a long memo across directory
refresh and clipboard operations, DOS CPU progress and retained physical RAM,
CR3 and generation IDs. It also checks the whole exported disk hash is unchanged.
Existing file/editor/image/clipboard/clock/calculator and K386 suites remain in CI.

The memo's 1 KiB text buffer is stored after the directory buffer in a DOS-owned
allocation. KDESK.EXE reserves a 12 KiB stack in its separate data segment;
see the [MZ executable layout](kdesk-exe.md). No guest kernel, browser window
manager or emulator CPU change is required.

General DOS/BIOS compatibility, shared disk writes and external graphics
virtualization retain the limits described in [K386 Enhanced](k386-enhanced.md).
