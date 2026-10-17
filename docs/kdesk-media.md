# KDESK clipboard and images

Boot the MS-DOS 4.0 option; KDESK starts automatically. F10 returns to DOS,
where `KDESK` opens it again. KDESK uses PC-9821 PEGC
256-color graphics and moves complete windows at pixel resolution. F9 or Paint
starts KPAINT; Apps includes KVIEW and KPAINT, and Files opens BMPs in KVIEW.

## DOS image tools

`KVIEW [file.bmp]` displays images (default: `COLORS.BMP`). `KPAINT [file.bmp]`
edits images, or creates a 224x144 document without a filename. Both accept
uncompressed 1/4/8/24-bit BMPs, including top-down files, up to 320x200 pixels.
Colors are mapped to the fixed desktop palette. Save writes 8-bit BMP.

| Key | Action |
| --- | --- |
| F1 / F2 | Help / Open |
| F3 / Ctrl+S / F4 | Save / Save / Save As (KPAINT) |
| F5 / F10 | New / Quit |
| P / L / R / F / I / E / S | Pencil / Line / Rectangle / Fill / Pick / Erase / Select |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / Cut / Paste at the image cursor |
| Ctrl+Z / U | Swap the last edit for undo/redo |
| Arrows / Space | Move cursor / paint a pixel |

Drag on the image to draw/select; click a palette swatch to change color.
Right-click picks a canvas color. Copy uses the selected rectangle or whole
image. Image clipboard and one-level undo live in that process's DOS memory.
The complete controls are also included as `KIMAGE.TXT` on the disk.

Open/New/Quit prompt before discarding edits. Save As prompts before replacing
a different existing file. Save writes a temporary file and renames only after
successful close; failed writes preserve the original. `KDIMG.TMP`/`KDIMG.BAK`
are reserved for safe replacement and existing copies block saving.

## WebNP2 controls

Open **More → KDESK Clipboard and Images** (Japanese: **KDESK クリップボードと画像**).

- Text: Copy/Cut in Memo, then Get from KDESK and Copy to host. Read from host
  or enter text, then Paste to DOS. Memo accepts up to 1023 ASCII characters;
  selection is replaced or text is appended. Outside KDESK, text uses existing
  Shift_JIS keyboard input; use EDIT98 for Japanese. Image apps reject text paste.
- Images: Get DOS image reads KVIEW's image or KPAINT's copied selection/current
  image. Copy image to host writes PNG; Save PNG downloads it.
- Import: choose a browser-supported image file (PNG/JPEG/etc.) or Import host
  image, set an 8.3 `.BMP` filename, and import to FDD1. Images fit within
  320x200 without upscaling, with transparency composited on white and colors
  quantized to the DOS palette. Open the resulting file in KVIEW/KPAINT with F2.
  Existing files require confirmation before replacement.

Host clipboard access happens only on the corresponding button press. Browser
permissions and clipboard API availability apply; file import, text selection
and PNG download provide alternatives. Keys in the panel do not reach DOS.
Disk import waits for floppy I/O to settle and uses WebNP2's existing FAT writer.

## Build and validation

CI pins the MS-DOS implementation in `scripts/prepare-msdos4-cpanel-ci.sh`,
rebuilds CPANEL and all desktop/image applications, and bundles them before
Pages is built. The tracked image remains the reproducible baseline. Existing
kernel/tools/driver bytes and provenance are retained. All new DOS image tools
share KDESK's MIT notice; `COLORS.BMP` is an original generated color chart.

`verify-window.mjs` matches the pinned native source verifier. It checks palette
output, held-button live moves, native text/image clipboard, BMP formats,
drawing, undo/redo, fill, save errors and unsaved-change prompts. The browser
media verifier exercises visible menu controls and both directions of text/image
exchange, BMP conversion/opening and mobile layout. Clipboard APIs are mocked
in this test so validation does not change the host user's clipboard.
