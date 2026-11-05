# KGUI32 graphical client integration: plan

Generate the native GUI SDK, calculator and clock from one pinned clean
MS-DOS commit. Keep the optional KGUI32 image separate and retain normal
KDESK and mixed text-session coverage. Add real guest GUI+GUI and GUI+DOS
Playwright coverage on PEGC/Cirrus: actual CPL3 contexts/private RAM,
calculator keys/mouse, clock/background progress, lifecycle/ownership,
invalid requests, fault/restart, resource reclamation and whole FAT12 hashes.

Do not commit generated images/manifests/licence output. Preserve existing
user data and the current two slots/4 MiB PM32/16 MiB/read-only limits.
Open draft PRs before functional implementation; keep draft until tests and
CI complete; do not merge. Japanese/clipboard/write services remain later.
