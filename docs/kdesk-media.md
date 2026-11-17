# KDESK browser clipboard and images

Native KVIEW/KPAINT controls, BMP formats and TMP/BAK behavior are maintained in
[MS-DOS: image tools](https://github.com/kumakumapon/MS-DOS/blob/main/docs/kdesk-media.md).

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
