# KGUI32 SDK 2 / Files integration

The native implementation will provide reusable GUI controls and KGFILES.EXE,
a read-only A: root file browser with text preview in its own protected canvas.
Files and Clock must coexist in the existing two slots, each with private
4 MiB, alongside the separate GUI context. Saving, IME, subdirectory access,
image surfaces and larger slot/memory budgets remain later milestones.

Image generation will pin the tested native commit and include Files and its
read-only metadata fixtures. No generated disk, manifest or licence output is
committed and saved user images are not replaced.

Playwright will operate the actual guest widgets and launcher on PEGC/Cirrus:
list/filter/select/preview/scroll/back, mouse capture, keyboard focus, resize,
background Clock, stop/resume, faults/restart and complete cleanup. Tests will
read actual CPU/RAM and directory/file data, reject malformed/stale service
requests and compare the complete FAT12 disk before/after. Existing GUI SDK 1,
DOS/PM32 session and legacy suites, npm test/build and both CIs remain required.

Implementation, architecture decisions and results will be recorded before
review. Native is merged before WebNP2; neither PR is merged automatically.
