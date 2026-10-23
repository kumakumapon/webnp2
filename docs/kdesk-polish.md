# KDESK 1.9: finding apps and arranging work

The ordinary DOS image and experimental KDESK/386 image share the same native
PC-98 desktop. Version 1.9 adds original color artwork, drawn title controls,
inset window/address-bar details and a geometric desktop background. The native
16-color renderer and PEGC 256-color renderer use the same controls. The MZ
code/data segment limits and 12 KiB stack reservation remain enforced.

## Find apps

Press **Ctrl+K**, click **Kuma Desktop** in the top menu, or click **Find** in
the launcher. Type one or more ASCII words. Search ignores case and word order;
`math` finds Calculator, `window right` finds Tile right, and `dos 2` finds the
second DOS session on the experimental profile.

Use Up/Down, Home/End or Page Up/Down, then Enter. Click a result to open it;
the footer arrow buttons page through results. Ctrl+A selects the query so
typing replaces it, and Ctrl+U clears it. Escape, Ctrl+K, the close control or
an outside click closes the panel. An outside click is consumed. Search input
does not reach the Memo or DOS program underneath. Host clipboard insertion
into the Memo is rejected while the panel is open.

The existing launcher and shortcuts remain available. **Ctrl+K and Ctrl+D are
reserved by KDESK even when a DOS window has focus.** A full-screen DOS shell
still uses ordinary foreground EXEC; its result describes that behavior.

## Arrange windows

Focus a window, open Find apps and select **Tile left** or **Tile right**. The
window occupies one half of the work area, with the menu and taskbar accessible.
**Restore window** returns its original size and exact pixel position. Changing
sides or maximizing does not overwrite that original rectangle. Ctrl+G on a
tiled window maximizes it; another Ctrl+G restores the normal rectangle.

Restore before dragging a tiled/maximized window. F6/F7 restore first, then use
the existing whole-cell keyboard movement/resizing. Contents and DOS execution
remain live; scroll ranges adjust to the new viewport.

## Show the desktop

Press **Ctrl+D** or click **Desk** at the left of the taskbar. Visible windows
hide while their work continues. Repeat to restore that set and its previous
input focus. Windows that were already minimized stay minimized. Closed windows
are not reopened, and independently opened windows remain open.

The remaining taskbar space fits all ten windows, including both DOS sessions.
Clicking an ordinary task still switches/restores it or minimizes the active one.

## Validation and limits

`scripts/verify-kdesk-polish.mjs` uses both real DOS images with Playwright. It
checks query matching and bounds, real browser Ctrl+K/Ctrl+D input, mouse result
selection/pagination, cancellation with pixel restoration, retained unsaved Memo
and calculator state, minimized-window preservation and input focus. It also
checks left/right/maximize restoration after an odd-pixel drag.

On K386 it inspects actual KSH screens to detect leaked modal input, and runs
two real COUNTER.COM children while their windows are hidden and tiled. CPU
progress, private RAM/CR3/generation IDs and PSP bytes are inspected; the complete
exported disk hash must remain unchanged. Existing MZ, desktop, image, clipboard,
Japanese-input and K386 regression suites remain required.

General DOS/BIOS compatibility, shared writes and external graphics virtualization
retain the [existing K386 limits](k386-enhanced.md).
