# WebNP2

[日本語](README.ja.md)

A web-based PC-98 emulator player, powered by [NP2kai](https://github.com/AZO234/NP2kai)
compiled to WebAssembly (NP2kai-wasm). The goal is a "just open the URL and
play" experience — launch, play, and resume — with progress carried across
sessions.

This repository is a fork of [uraraworks/WebNP2](https://github.com/uraraworks/WebNP2).
Site and release links below refer to `kumakumapon/webnp2`.

See [docs/DESIGN.md](docs/DESIGN.md) for design details.

## Try it now

- **Live site**: <https://kumakumapon.github.io/webnp2/>
- **MS-DOS 2.0 PC-98 auto-boot demo**: <https://kumakumapon.github.io/webnp2/?fd1=./msdos2/msdos2-pc98-06c61f748971.xdf&run=1>
- **MS-DOS 4.0 + RetroBasic auto-boot demo**: <https://kumakumapon.github.io/webnp2/?fd1=./msdos4/msdos4-retrobasic-f75824650c7b.xdf&run=1>
- **FreeDOS(98) auto-boot demo**: <https://kumakumapon.github.io/webnp2/?freedos=1&run=1>
  (boots straight to the DOS prompt with no clicks; audio unmutes on your first click)

No ROMs or proprietary commercial software images are bundled.
FreeDOS(98), the MIT-licensed MS-DOS 2.0 port, and MS-DOS 4.0 with native RetroBasic are included. You can load your own
HDD/FD images by dragging and dropping them onto the screen.

## Deploy to your own GitHub Pages

The workflow in [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
builds this repository and publishes its `dist/` artifact to **this repository's
GitHub Pages** using `GITHUB_TOKEN`. No upstream repository or external deployment
token is used.

1. In `kumakumapon/webnp2`, enable GitHub Actions if GitHub shows a prompt to
   enable workflows on a fork.
2. Open **Settings → Pages → Build and deployment**, set **Source** to
   **GitHub Actions**, and save if prompted.
3. Merge the changes into `master` to deploy automatically, or open
   **Actions → Deploy to GitHub Pages → Run workflow** and select `master`.
4. Wait for both the `build` and `deploy` jobs to finish. The `github-pages`
   environment and deployment job show the published URL:
   <https://kumakumapon.github.io/webnp2/>.

The site URL becomes available after the first successful deployment. Vite uses
relative asset paths (`base: './'`), so the lowercase `/webnp2/` project path works
without changing the build configuration. If you fork again, use
`https://<owner>.github.io/<repository>/` and update the site/repository links in
the documentation and HTML pages, plus `WEBNP2_REPO_URL` in `src/main.ts`.
If the default branch changes, update `on.push.branches` in the workflow too.

Optionally, set **Settings → Secrets and variables → Actions → Variables →
New repository variable** with the name `DISK_PROXY_URL` and your own relay URL
(no trailing `/`). The workflow passes it as `VITE_DISK_PROXY`; leaving it unset
uses direct fetching only. Google Drive links require a relay.

MCP releases are separate from Pages deployment. To make the download links
below available in this repository, push an `mcp-*` tag (for example,
`mcp-2026-10-03`) to run **Release MCP server**. Until a release containing
`webnp2-mcp.mjs` exists, use the source setup in [mcp/README.md](mcp/README.md).
The release workflow also publishes to the repository where it runs.

## Usage

An introduction page highlighting WebNP2's unique features is available at
<https://kumakumapon.github.io/webnp2/about.html?lang=en>.

A player-facing help page (with screenshots) is available at
<https://kumakumapon.github.io/webnp2/help.html?lang=en>. It can also be opened
from **More (…) → Help** in the player.

### URL parameters

```
https://.../?hdd=<HDD image URL>&fd1=<FD1 image URL>&fd2=<FD2 image URL>&run=1&clk=<multiplier>&lang=ja
```

| Parameter | Meaning | Notes |
|---|---|---|
| `hdd` | URL of an HDD image | NP2kai-compatible formats (`.thd`, etc.). If the fetched content is a ZIP/LZH archive, it's automatically extracted and the disk image(s) inside are registered to the Disk Library before use |
| `fd1` / `fd2` | URL of a floppy disk image | `.d88`, `.fdi`, etc. A ZIP/LZH archive is auto-extracted the same way as `hdd` |
| `lib` | URL of a disk image to register in the Disk Library only (repeatable) | See below |
| `run` | `1` to boot immediately without the start overlay | Due to browser autoplay restrictions the emulator starts muted, showing an "Audio is muted" banner; audio is enabled on your first click or key press |
| `mem` | Extended memory size in MB | Defaults to `1` (640 KB conventional + 1 MB extended — a typical DOS setup). Increase it (e.g. `mem=13`) for software that needs more memory. Clamped to 0–230 |
| `clk` | Clock multiplier | Written to the core cfg as `clk_mult` (integer, clamped to 1–32). Core default when omitted |
| `lang` | UI language (`ja` / `en`) | If omitted, resolved in order: `localStorage['webnp2.lang']` → the browser's `navigator.language` (`ja` if it starts with `ja`) → default `en`. Switch it from **More (…) → Language**; the choice is persisted and reused on subsequent visits |
| `freedos` | `1` to boot the bundled FreeDOS(98) floppy | Mounts `public/freedos/fd98_2hd.xdf` as FD1 (unless `fd1` is also given, which takes priority). Combine with `run=1` to ride the existing auto-start flow |
| `worklet` | `0` to disable low-latency AudioWorklet audio output | Falls back to the legacy SDL (ScriptProcessor) path. Enabled by default; auto-falls back on unsupported browsers too |
| `aspect` | `4:3` or `native` to override the display mode at startup | Defaults to `4:3` (matches a real CRT with a 1.2x vertical correction). `native` is pixel-perfect (square pixels). Only applies at startup; afterwards the setting from **More (…) → Display → Display Mode** (localStorage) is used |
| `alat` | Initial low-water mark of the AudioWorklet ring buffer, in ms | Lower is lower-latency but more prone to dropouts. Defaults to one core chunk (~23ms). Raised automatically when dropouts are detected |
| `perf` | `1` shows a performance overlay (FPS / main-thread busy / audio supply) | For diagnosing slowdowns |

If no `hdd`/`fd1`/`fd2`/`freedos` parameters are given, the start overlay offers
three choices: "Start As-Is" (no image loaded — drag and drop an HDD/FD image
onto the screen afterward) or "Start with FreeDOS(98)" (boots the bundled
FreeDOS(98) floppy described below), or "Start with MS-DOS 2.0" (opens the
bundled PC-98 port through the `fd1` auto-boot URL). If the Disk Library is not empty, a fourth
"Boot from Saved Disk" button is also shown. If any disk is specified via URL
parameters, the overlay instead shows the single traditional "Click to Start"
button. Only the displayed buttons start the emulator; clicking empty overlay
space does nothing, preventing accidental boots.

**Important: any URL passed via `hdd`/`fd1`/`fd2` must be served from an origin
with CORS (`Access-Control-Allow-Origin`) enabled.** Images are fetched with
the browser's `fetch` API, so if the hosting server doesn't send the
appropriate CORS headers, the fetch will fail and an error message will be
shown on screen. GitHub raw, GitHub Pages, and your own CORS-enabled server
work directly (plain fetch).

For Dropbox, you can **paste the share URL exactly as "Copy link" gives it to
you** — no need to change `dl=0` to `dl=1`. The app rewrites the hostname to
`dl.dropboxusercontent.com` and fetches it directly, so no relay is involved.
Only file share links (the `/scl/fi/...` form) have been verified; the older
`/s/...` form, folder shares, and password-protected links are untested (the
rewrite may not cover them, in which case the relay below is used as a
fallback).

Google Drive doesn't support CORS for a direct fetch, so it fails
at first, but a build configured with `VITE_DISK_PROXY` **automatically retries through
a relay service** (only when the direct fetch fails). This repository does not
configure a relay by default; set `DISK_PROXY_URL` for Pages (see above) or
`VITE_DISK_PROXY` for a local build (see below) to use this.
**OneDrive share links (`1drv.ms` / `onedrive.live.com` / `sharepoint.com`)
are not supported** — they don't work even through the relay (confirmed by
testing). Please use Dropbox or Google Drive instead.

Even when a `hdd`/`fd1`/`fd2` URL can't be judged by its extension (e.g. a
distribution URL with no extension), the fetched bytes are checked for a
leading ZIP/LZH signature and auto-detected as an archive. If extraction
yields a single disk image, it's used directly for that slot; if it yields
two or more, WebNP2 can't decide which one to use, so it skips auto-boot
(even with `run=1`) and opens the Disk Library instead, with the matching
folder expanded and highlighted so you can pick one. If the archive doesn't
contain an image matching the requested slot (e.g. a `hdd` archive that only
contains FD images), an error message is shown and startup is aborted. Once
a URL has been extracted, it stays registered in IndexedDB, so opening the
same URL again resumes from the Disk Library instead of re-downloading it.

Notes on `lib` (for sharing links to multi-disk collections):

- Use `?lib=<url>` and repeat it (`&lib=<url2>`, ...) to specify **multiple
  URLs** (comma-separated values aren't supported, since a URL itself can
  contain a comma).
- Unlike `fd1`/`fd2`/`hdd`, `lib` registers images **regardless of their kind**
  (FD or HDD) — a ZIP mixing HDD and FD images can be registered as-is (the
  usual kind check still applies once you insert an image into a slot).
- Regardless of how many disk images it resolves to, `lib` never auto-inserts
  into a slot — it **always opens the Disk Library** so the recipient can pick
  what to use.
- `run=1` is skipped whenever `lib` is given (the Disk Library opens instead
  of auto-booting).
- If combined with `fd1`/`fd2`/`hdd`, those URLs aren't discarded — WebNP2
  only resolves them once you actually start the emulator (via the overlay's
  start button), so pressing that button afterward still boots with them,
  exactly as it would without `run=1`.
- Fetching, resuming on revisit, and archive extraction follow the same rules
  as `fd1`/`fd2`/`hdd` (CORS required, no re-download on revisit, ZIP/LZH
  auto-extracted).

### Drag & drop

Dropping a file onto the screen area auto-detects whether it's an HDD or FD
image based on its extension.

- HDD: `.thd` `.hdi` `.nhd` `.hdd`
- FD: follows the formats accepted by the NP2kai core itself
  (`np2_isfdimage()` in
  [NP2kai/sdl/np2.c](https://github.com/AZO234/NP2kai)): `.d88` `.d98` `.fdi`
  `.hdm` `.xdf` `.dup` `.2hd` `.nfd` `.fdd` `.hd4` `.hd5` `.hd9` `.h01` `.hdb`
  `.ddb` `.dd6` `.dd9` `.dcp` `.dcu` `.flp` `.tfd` `.fim` `.img` `.ima` — except
  `.bin`, which is excluded because it's too generic and prone to false
  positives
- Archives: `.zip` `.lzh`

Dropping multiple files at once shows a confirmation dialog.

**HDDs can only be handled before boot.** The emulator core cannot swap a HDD
while running, so dropping a HDD image before boot no longer starts the machine:
it is *set* into the HDD slot instead (the slot name is shown in italics). While
it is only set, you can edit its contents from the file transfer dialog, then
press the boot button when you're ready. After boot, both the HDD slot buttons
and the HDD entries in the file transfer target list are disabled.

Archives are extracted and only the disk images inside are added to the Disk
Library (readme files and the like are ignored). A single disk boots right
away; an archive with multiple disks is grouped into a folder named after the
archive and the Disk Library opens so you can choose which disk to boot from.
Archives can also be dropped while the emulator is running to import them.

Dropping a disk image or archive onto the Disk Library dialog itself only
registers it in the library, without setting it into any slot. An archive
with multiple disks is likewise grouped into a folder that's expanded and
highlighted.

### Keyboard and mouse

- Key input is delivered to the guest as raw scancodes. PC-98 specific keys are
  mapped as XFER = right Alt (right Option) and NFER = left Alt (left Option).
- **Kanji input inside the guest** requires a guest-side FEP (a resident
  kana-kanji conversion program such as ATOK or VJE-β). Your host OS IME has no
  effect on the emulator screen (turn it off while typing). FreeDOS(98) does
  not include a FEP, so use your own MS-DOS + FEP disk images for kanji input.
- **Mouse** support is enabled from **More (…) → Input → Capture Mouse** (the
  pointer is locked to the screen and emulated as a PC-98 bus mouse; press Esc
  to release). The DOS prompt itself does not use a mouse. Software that reads
  the bus mouse directly works as-is; software using the int 33h API needs a
  guest-side mouse driver (MOUSE.SYS etc.).
- If mouse-driven software feels sluggish, raising the clock multiplier (e.g.
  `?clk=8`) helps. Don't raise it beyond what your machine can emulate in
  real time, though — the emulation starts dropping frames and gets choppy.

### Input controls

- The on-screen keyboard includes the PC-98 numeric keypad, but it is hidden by
  default; toggle it with the “Tenkey” key inside the keyboard panel (useful on
  laptops without a physical keypad, for software that needs tenkey movement).
- Open **More (…) → Input → Input Settings** to configure three tabs:
  **Gamepad**, **Keyboard**, and **Virtual Pad**. Each tab uses the same PC-98
  keyboard picker for choosing output keys.
- Physical gamepad buttons and axes can be mapped to PC-98 keys. Host keyboard
  remapping is off by default and provides named profiles, including the built-in
  “Tenkey Movement (Arrows → Tenkey)” profile.
- The Virtual Pad is intended primarily for phones and tablets. In portrait it
  appears below the emulator screen; in landscape its controls occupy the left
  and right margins so fingers do not cover the game.
- The Virtual Trackpad turns a one-finger drag into relative cursor movement, a
  short tap into a left click, a two-finger tap into a right click, and a
  press-and-hold (about 450ms without moving) followed by a drag into a
  left-button drag. The classic absolute-tracking touch on the emulator canvas
  itself still works alongside it. A two-finger drag (the usual trackpad
  gesture for scrolling) is not implemented, since the PC-98 bus mouse only has
  two buttons and nothing on the guest side would receive it.
- While the on-screen keyboard, Virtual Pad, or Virtual Trackpad is visible, a
  **⌨ / 🎮 / 🖱** switch appears immediately after the keyboard button. Press
  the active 🎮 side again to choose a Virtual Pad profile or edit assignments.
  While any input panel is open, the layout shrinks to fit one screen, which
  temporarily hides the floppy slot row (close the panel before swapping
  disks).

The toolbar keeps Pause, Fullscreen, On-screen Keyboard, Screenshot, and More
(…) centered, with Reset Machine split off to the right end (so an accidental
tap doesn't wipe out whatever state is currently running). The More menu
groups less frequent actions under Display, Input, Sound, Disk, and State,
with ROM Files, Debugger, Help, and Language as direct rows. Language is
shown with a globe icon and its current value (“English” or “日本語”).

### Progress persistence

Once running, each mounted image is checked for changes on a 30-second timer,
when the tab becomes hidden (`visibilitychange`), and when the page is being
unloaded (`pagehide`); changes are automatically saved to IndexedDB (the
`webnp2` database). Opening the same URL again resumes from the saved state.
The "Reset to initial state" button deletes the saved data so the images are
re-fetched from their original URLs.

The "Download disk" button lets you download the current disk image as a
Blob.

### Bundled FreeDOS(98) boot floppy

`public/freedos/fd98_2hd.xdf` is a 2HD boot floppy image of
[FreeDOS(98)](https://github.com/lpproj/fdkernel), a port of FreeDOS (an
MS-DOS-compatible OS) for the PC-9801/9821 series, combining the
FreeDOS(98) kernel ([lpproj/fdkernel](https://github.com/lpproj/fdkernel),
branch `nec98test`, tag `test-20220120-cherrypick`) and FreeCOM DBCS
([lpproj/freecom_dbcs2](https://github.com/lpproj/freecom_dbcs2)). Both are
free software licensed under **GPLv2 or later**; the image is redistributed
under the same terms with the source available from the repositories above.
See `public/freedos/README.txt` for the full attribution/license text (in
Japanese and English).

It's bundled so visitors can try the emulator without hunting down an OS
image themselves. Three ways to use it:

- Open the player with no `hdd`/`fd1`/`fd2` params and click "Start with
  FreeDOS(98)" on the start overlay.
- Add `?freedos=1` to the URL (optionally with `run=1` for auto-start).
- After boot, click the "Insert FreeDOS(98)" button next to the FDD1 slot,
  then reset the machine to boot it.

The bundled image is persisted to IndexedDB under the fixed key
`freedos:fd98_2hd` regardless of which entry point was used, so edits made
inside FreeDOS(98) (formatting, saving files, etc.) carry over between
visits, and "Reset to initial state" restores the pristine distributed
image.

### Bundled MS-DOS 2.0 PC-98 boot floppy

Select **Start with MS-DOS 2.0** on the start overlay, or open the
[MS-DOS 2.0 demo](https://kumakumapon.github.io/webnp2/?fd1=./msdos2/msdos2-pc98-06c61f748971.xdf&run=1). The image is served by this GitHub Pages site;
no external image host or relay is needed. This uses the existing `fd1` and
`run=1` parameters, so explicit disk URLs continue to work as before.

The boot floppy comes from [kumakumapon/MS-DOS](https://github.com/kumakumapon/MS-DOS),
commit `35cb651ae720ddb4de8ae6b7f335628a0c5ac001`. It contains the original
Microsoft MS-DOS 2.00 kernel and Command 2.02 plus the port's PC-98 OEM BIOS/IPL,
not the FreeDOS(98) kernel. It is distributed under the **MIT License**;
see [public/msdos2/LICENSE.txt](public/msdos2/LICENSE.txt), also included inside
the disk as `DOSLIC.TXT`. This is an unofficial port and does not imply
Microsoft support or endorsement.

The screen shows `MS-DOS version 2.00` and `A>`. Try `VER`, `DIR`, `ECHO`, `TYPE`,
and `COPY`. Support is limited to drive **A:** on WebNP2 (386 or later, 1232 KiB
FAT12 floppy); HDDs, a second floppy, physical machines, and recreating boot disks
with `FORMAT`/`SYS` are unsupported. Software using IBM PC BIOS/video/hardware
directly cannot run on PC-98. No Japanese input FEP is bundled.

Disk edits persist in IndexedDB when you revisit the same boot URL. The existing
**Reset to initial state** action restores the distributed disk and deletes your
changes. The filename contains the image's content hash so future versions get
separate saved disks. Full source/limits are in
[the port documentation](https://github.com/kumakumapon/MS-DOS/blob/35cb651ae720ddb4de8ae6b7f335628a0c5ac001/docs/pc98-webnp2.md);
[manifest.json](public/msdos2/manifest.json) records provenance and file checksums.

### Bundled MS-DOS 4.0 + RetroBasic boot floppy

Select **Start with MS-DOS 4.0 + RetroBasic** on the start overlay. The bundled
1232 KiB FAT12 disk boots to `A>`; `VER` reports **4.00**. Run `RBASIC` for
interactive BASIC, or `RBASIC PRIMES.BAS`, `RBASIC GRAPHICS.BAS`, or
`RBASIC FILEIO.BAS` to try the samples. `SYSTEM` returns from BASIC to DOS.
In BASIC, try `10 PRINT "HELLO"`, `RUN`, then `SAVE "HELLO.BAS"`.
Sequential file I/O includes `OPEN`/`CLOSE`, `PRINT #`/`WRITE #`/`INPUT #`/
`LINE INPUT #`, and `EOF`/`LOF`/`LOC`/`INPUT$`.

The DOS kernel and shell are built from the v4.0 sources in
[MS-DOS commit 0b6f8f2](https://github.com/kumakumapon/MS-DOS/tree/0b6f8f2f1eae2b6727dfe83b66cd81e222da0596);
native RetroBasic comes from
[RetroBasic commit 6609a04](https://github.com/kumakumapon/RetroBasic/tree/6609a046ae0d1ec0206739524627a48b54c84ba9).
Both MIT license notices are in [public/msdos4/LICENSE.txt](public/msdos4/LICENSE.txt)
and `LICENSE.TXT` inside the disk. [manifest.json](public/msdos4/manifest.json)
records exact source commits and image/file checksums. This is an unofficial port.

Disk writes persist for the same boot URL; **Reset to initial state** deletes
changes and restores the bundled disk. Each image version has a content hash in
its filename. Support is limited to WebNP2, 386 or later, and drive A: with the
bundled geometry. HDD/FAT16, a second floppy, Japanese input, and recreating
boot disks with `FORMAT`/`SYS` are unsupported. Native BASIC implements a subset
of the Python version; see [source and limits](public/msdos4/README.txt) and
[the native feature table](https://github.com/kumakumapon/RetroBasic/blob/6609a046ae0d1ec0206739524627a48b54c84ba9/docs/pc98-webnp2.md).

## MCP server (control WebNP2 from AI agents)

WebNP2 can be driven by AI agents (Claude Code etc.) through a local MCP
server: read the text screen, type keys, take screenshots, and reset the
machine. The MCP server runs on your machine; the page (local or the
public one above) connects back to `ws://127.0.0.1` when opened with the
`?bridge=1` parameter, so nothing is sent to any external server.

Setup is a single self-contained file — no `git clone`, no `npm install`,
just Node.js 18+:

```sh
curl -fLO https://github.com/kumakumapon/webnp2/releases/latest/download/webnp2-mcp.mjs
claude mcp add webnp2 -- node "$PWD/webnp2-mcp.mjs"
```

Then open `https://kumakumapon.github.io/webnp2/?freedos=1&run=1&bridge=1`
in your browser. Full instructions and the tool list live in
[mcp/README.md](mcp/README.md). To have your AI agent set it up for you,
just point it at that file and say "set up MCP access to WebNP2 as
described here".

Note: with the public (https) page, use a Chromium-based browser or
Firefox — Safari blocks `ws://` connections from https pages even to
localhost.

## Run locally on Windows or Linux

Install **Node.js 22.12 or later with npm** from <https://nodejs.org/> (Node.js 24
LTS is recommended). Clone this repository or download and extract its ZIP.
The emulator core and bundled boot disks are already included; no assembler or
Chromium installation is required to launch the player.

On **Windows**, double-click `start-windows.cmd`, or run it from PowerShell:

```powershell
.\start-windows.cmd
```

On **Linux**, run this in a terminal in the repository directory:

```sh
./start-linux.sh
# If the ZIP extraction did not preserve executable permissions:
bash start-linux.sh
```

The launcher installs dependencies using `npm ci --include=dev` on first use,
then starts Vite and opens <http://127.0.0.1:5173/>. Internet access is needed
for installation. Later launches reuse dependencies; changes to `package.json`,
`package-lock.json`, or the Node.js major version/platform trigger reinstalling.
Keep the terminal open while using WebNP2; press **Ctrl+C** to stop it.
The server listens on your own machine only. FreeDOS(98), MS-DOS 2.0, and your
own disk images work as on the hosted player; browser saves belong to the local
origin and are separate from GitHub Pages (changing the port also changes the origin).

Both launchers accept the same options:

| Option | Purpose |
| --- | --- |
| `--port 5180` | Use a different port; an occupied port produces an error |
| `--no-open` | Start without opening a browser (useful on a headless machine) |
| `--install` | Force a clean dependency reinstall if local dependencies are damaged |
| `--help` | Show usage |

For example: `./start-linux.sh --no-open --port 5180` or
`.\start-windows.cmd --no-open --port 5180`. The scripts also work when launched
from another directory, including a checkout path containing spaces. If a
prerequisite or installation fails, follow the error shown in the terminal.

## Development

```sh
npm install
npm run dev       # dev server
npm run build     # type-check + production build (dist/)
npm run build:embed # build the reusable ESM embed package + type declarations
npm run preview   # preview the production build
npm test          # unit tests (vitest)
```

To enable relay fetching for Google Drive (and as a fallback for Dropbox share
links the hostname rewrite can't cover), set the `VITE_DISK_PROXY`
environment variable at build time to the URL of your own relay service (no
trailing `/`). If unset (the default), no relay is used and sources that the
direct fetch fails for will simply error out. See the comment in
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) for how this is
configured for the public GitHub Pages build.

The reusable engine/debugger/UI-component API is documented in
[`packages/embed/README.md`](packages/embed/README.md).

### Updating the help screenshots

`public/help/*.png` are the illustrations used by the help page (help.html).
Retake them whenever the UI changes. With the dev server running, the following
recaptures all 18 images (ja/en) with the same framing — the library samples are
generated by the script, so no real disk images are needed.

```sh
npm run dev            # in another terminal
npm run capture-help
```

### Updating the MS-DOS 2.0 floppy

Build the PC-98 port in a clean `kumakumapon/MS-DOS` checkout using its
[build instructions](https://github.com/kumakumapon/MS-DOS/blob/main/docs/pc98-webnp2.md).
Then import the image, manifest, and license into this repository:

```sh
python3 scripts/update-msdos2.py /path/to/MS-DOS
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
# In another terminal (Chromium must be installed):
CHROMIUM=/usr/bin/chromium node scripts/verify-msdos2.mjs http://127.0.0.1:4173/
```

The importer reads `ports/pc98/build/`, verifies the image checksum and original
kernel/shell/license hashes, and records the source commit. Commit the new
`public/msdos2/` files and update the image URL in the READMEs/help page. The
player reads the image filename from the manifest. Keep old image filenames
available for existing saved disks and shared links. Pages publishes the tracked
files with the normal build; assembling MS-DOS during each deployment is unnecessary.

### Updating the DOS 4.0 + RetroBasic floppy

Use clean checkouts of the revisions recorded in
[public/msdos4/manifest.json](public/msdos4/manifest.json). Follow the
[DOS 4.0 build instructions](https://github.com/kumakumapon/MS-DOS/blob/0b6f8f2f1eae2b6727dfe83b66cd81e222da0596/docs/pc98-dos4.md)
and [native RetroBasic build instructions](https://github.com/kumakumapon/RetroBasic/blob/6609a046ae0d1ec0206739524627a48b54c84ba9/docs/pc98-file-io.md), then:

```sh
python3 /path/to/RetroBasic/ports/pc98/build_disk.py --msdos /path/to/MS-DOS --dos-version 4
python3 scripts/update-msdos4-retrobasic.py /path/to/MS-DOS /path/to/RetroBasic
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
# In another terminal (Chromium must be installed):
CHROMIUM=/usr/bin/chromium node scripts/verify-msdos4.mjs http://127.0.0.1:4173/
```

The importer checks both clean source revisions, DOS version, image checksum,
both FATs, boot code, executables, samples, and complete license notices.
Commit `public/msdos4/` and update the image links in the READMEs/help page.
Keep previous image filenames for saved disks and shared URLs. The normal
Pages build includes the disk; users and deployment do not need DOS build tools.

### Updating the core (public/core/)

`public/core/` holds the build output of
[NP2kai-wasm](https://github.com/AZO234/NP2kai)
(`emnp21kai_sdl2.js` / `.wasm` / `font.bmp` / `LICENSE.NP2kai`). This
directory is tracked in git (build artifacts are committed to the repo by
design).

To refresh the core:

```sh
scripts/update-core.sh
```

By default it copies from `/Users/haruurara/MyProject/_emulator/PC98/NP2kai/build`.
To copy from a different location, set the `NP2KAI_BUILD_DIR` /
`NP2KAI_ROOT_DIR` environment variables.

### Local test files

`public/test/` is a place to keep HDD images etc. for local testing. It's
excluded via `.gitignore` and never committed.

## License and bundled content

- The license for this repository's own code is unspecified (internal
  tooling).
- The NP2kai-wasm build artifacts under `public/core/`
  (`emnp21kai_sdl2.js` / `emnp21kai_sdl2.wasm` / `font.bmp`) are build
  output of NP2kai, which is BSD-family licensed; see
  `public/core/LICENSE.NP2kai` for the full license text.
- **No PC-98 ROM images or proprietary commercial software disk images are bundled with
  this repository.** `font.bmp` is font data derived from the Shinonome
  font project and is unrelated to, and does not raise the same copyright
  concerns as, real PC-98 ROM images.
- ROM-less boot is implemented via NP2kai's built-in BIOS-compatible
  routine (inherited unmodified from upstream NP2/NP2kai, BSD-licensed
  source). As part of this routine, the string
  `"Copyright (C) 1983 by NEC Corporation"` is placed at the same guest
  memory location as on real hardware; some software uses this string for
  NEC machine-type detection. This is upstream behavior carried over as-is
  for software compatibility, not something added by this repository, and
  the string is present in the bundled wasm build (see NP2kai's
  `bios/bios.c`).
- `public/msdos2/` contains the MS-DOS 2.0 PC-98 boot floppy under the MIT
  License, the full license notice, and provenance/checksums; see the section above.
- `public/msdos4/` contains the source-built MS-DOS 4.0 + native RetroBasic
  PC-98 boot floppy, both MIT license notices, and provenance/checksums.
- `public/freedos/fd98_2hd.xdf` is the FreeDOS(98) boot floppy described
  above, licensed under GPLv2+; source is available from
  [lpproj/fdkernel](https://github.com/lpproj/fdkernel) and
  [lpproj/freecom_dbcs2](https://github.com/lpproj/freecom_dbcs2). See
  `public/freedos/README.txt` for details.
- `public/rhythm/2608_bd.wav`, `2608_sd.wav`, `2608_top.wav`, `2608_hh.wav`,
  `2608_tom.wav`, and `2608_rim.wav` are a bundled substitute for the YM2608
  rhythm sound source samples, used so rhythm playback is not silent even
  when no real samples are registered ("YM2608風リズム音源音色データ Ver.2.0",
  by メモル / Takanori YOSHIMURA, memoru@kisoba.info, distributed from
  <https://sound.jp/jaime/fmp_top.html> — archived at
  <https://sound.jp/jaime/files/2608modoki2.zip>). Per the author's own
  terms (quoted from the bundled text, translated): "Free to distribute,
  reprint, or embed in software, for free or for a fee. If you embed it in
  software or a sample pack, a note of what title used it would be
  appreciated." **These are not extracted from a real YM2608 chip's ROM.**
  As the author states, they were assembled by editing samples from other
  sound sources to resemble the YM2608's rhythm sounds, and the author
  explicitly notes the waveforms are fundamentally different from the real
  chip's. If you register real `2608_*.wav` files via the ROM/asset dialog,
  they take priority over this bundled substitute (see
  [src/api/roms.ts](src/api/roms.ts)).
- Users are responsible for legally obtaining and using any disk images they
  load via the `hdd`/`fd1`/`fd2` parameters or drag & drop.

## Implemented features

- URL parameter loading with fetch progress display, drag & drop image loading
- Persistence via IndexedDB (auto-save, resume from previous state, reset)
- Hot FD swap/eject and blank FD creation while running, machine reset
- Pause/resume (the screen dims and resume only works from the center play
  button while paused; lowers host CPU load — measured: about 62% while
  running, settling to 1–3% within a few seconds after pausing)
- Mute (off by default; zeroes only the output-stage volume) and FDD seek
  sound on/off (on by default; its waveform is embedded in the core, so no
  extra sound file is needed). Both settings persist to localStorage and are
  restored on the next launch
- Setting a HDD before boot (from the library, a drop, or the slot buttons), and
  editing its contents while it is only set
- Blank HDD creation (40MB, FAT16-formatted; carries no IPL, so it is a data
  drive only)
- Drive access lamps (FDD1/FDD2/HDD glow red while being read or written)
- Save states (carried across sessions via IndexedDB)
- Screenshot capture (640x400/640x480 PNG, matching the active video mode)
- Switchable display mode (defaults to a 4:3 correction matching a real CRT —
  1.2x vertical scale, expand-only, sharp-leaning bilinear — toggle to
  pixel-perfect from **More (…) → Display**; the setting persists to
  localStorage, and `?aspect=4:3|native` overrides it at startup only)
- Bundled FreeDOS(98) boot, `run=1` auto-boot with mute banner
- Disk image download, fullscreen, Japanese/English UI toggle
- Disk library organization (.zip/.lzh import, multi-disk folders, renaming,
  and an insert-from-library menu on each FD slot)
- Smartphone support (touch controls, PC-98 on-screen keyboard with a
  toggleable tenkey block, an automatically placed Virtual Pad, and a
  Virtual Trackpad)
- Dark `#101010` page background, keeping the off-screen Virtual Pad controls visible
- Physical gamepad mapping and named host-key remapping profiles
- Three-tab Input Settings dialog with a shared PC-98 keyboard picker
- File transfer dialog between the browser and a disk image (with .lzh/.zip auto-extraction)
- Low-latency audio output via AudioWorklet (default; auto-falls back to the legacy SDL path)
- Automatic GitHub Pages deployment via GitHub Actions

Further implementation details and plans are
covered in [docs/DESIGN.md](docs/DESIGN.md).
