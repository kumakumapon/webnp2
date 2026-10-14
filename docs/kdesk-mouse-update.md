# Kuma Desktop mouse and visual update

The CI-generated MS-DOS 4.0 disk now builds KDESK with PC-98 bus-mouse support
and a refreshed 16-color desktop. Usage and build steps are in
[window-desktop.md](window-desktop.md).

The pinned MS-DOS source supplies the native hardware reader, pointer, CG-ROM
renderer and clickable desktop controls. The existing DOS kernel and tools
retain their original provenance; no mouse TSR is added.

WebNP2 preserves the first pointer target while homing and orders button events
after movement has settled. Button positions are captured per event, so a rapid
drag presses at its start and releases at its end. Release outside the canvas
and window blur also release held buttons. Pointer-lock capture remains handled
by the emulator as before.

CI rebuilds the image, checks the source verifier match, then runs browser tests
using both the bus-mouse API and real canvas mouse events. The generated disk,
manifest, guides, notices, screenshots and results are uploaded as artifacts;
Pages deploys the generated image after merge. The workflow needs only read
access to the repository and does not commit generated binary files.
