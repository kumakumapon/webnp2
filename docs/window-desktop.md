# KDESK browser distribution

The canonical native controls, rendering/hardware and DOS file contracts are in
[MS-DOS: window desktop](https://github.com/kumakumapon/MS-DOS/blob/main/docs/window-desktop.md).
Browser clipboard controls: [media guide](kdesk-media.md).

## Building the bundled disk

`scripts/prepare-msdos4-cpanel-ci.sh` pins the MS-DOS source commit. It builds
CPANEL, KDESK, KVIEW and KPAINT and updates the disk, manifest, guides and notices in the CI
workspace. Pages deploys that generated disk. The tracked baseline image is
an input to the build; the generated image is uploaded as a CI artifact.
The kernel and existing programs keep their original source provenance.

For a local checkout of the same source commit:

```sh
python3 scripts/update-msdos4-cpanel.py /path/to/MS-DOS --with-window
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --base /webnp2/
CHROMIUM=/usr/bin/chromium WEBNP2_NO_SANDBOX=1 \
  node scripts/verify-msdos4.mjs http://127.0.0.1:4173/webnp2/ test-results/dos4
```

The generated disk contains `KDESK.EXE`, `KDESK.TXT`, `KVIEW.EXE`, `KPAINT.EXE`,
`COLORS.BMP`, `KIMAGE.TXT` and `KDLIC.TXT`; the complete
MIT notice is also included in `LICENSE.txt`. The importer checks that
`scripts/verify-window.mjs` matches the verifier at the pinned source commit.
The browser verification exercises actual guest input including over 200 simultaneous RGB colors, pointer restoration and edge clipping, mouse/keyboard window
management, memo persistence and save errors, directory navigation, and
CPANEL/editor/COM program launches and click-to-return. A separate canvas-event
check covers first-click synchronization, rapid drags and release outside canvas.
The frame-sampling suite checks that the permanent menu never flashes away
during selection, focus changes or overlapped clock updates. The boot suite
checks automatic startup, F10 return, CPANEL preservation and reload.
The utility suite covers decimal arithmetic, memory, clipboard exchange, clock
progression, 12/24-hour switching, minimize/restore and icon/list navigation,
including narrow windows. The media suite covers text/image clipboard, BMP decoding, drawing, undo/redo,
fill/selection, file protection and the visible browser import/export controls. Screenshots and results are available
in the `bundled-dos-browser-validation` Actions artifact.

## Experimental concurrent DOS windows

The separate KDESK/386 boot choice adds guest-owned DOS windows with XMS-backed
private RAM, process memory/EXEC and BIOS interval timers. See the
[process and compatibility guide](k386-processes.md) for boot requirements,
original COMMAND.COM probes, controls, build checks and remaining restrictions.
The ordinary desktop and foreground tools described above remain available.

KDESK 1.9 adds native app search, window tiling and grouped desktop restoration.
See [the desktop guide](kdesk-polish.md) for controls and validation.

800×600・RGB565の選択、ビルドと検証については
[高解像度・65,536色表示](kdesk-highcolor.md)を参照してください。

See [native EXE tools and shell responsiveness](kdesk-native-tools.md).

Enhanced-mode standard tools now use [native guest windows](kdesk-window-tools.md),
including text editing, settings and images while both DOS sessions continue.


## PM32 text applications

The separate experimental KDESK/386 image includes resident K32HOST and shares
its two execution slots between V86 and PM32. Find apps (Ctrl+K) offers PM32
viewer, PM32 ticker and PM32 memory test. PM32 applications run in guest KDESK
windows and continue while another window or native GUI app has focus.
See [PM32 window usage and limits](k38632-windows.md); ordinary KDESK and
foreground real-DOS applications retain their existing execution path.
