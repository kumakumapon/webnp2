# KGUI32 text sessions: implementation plan

Baseline: published standalone GUI, native main and WebNP2 master after #38.
Integrate the existing two execution slots into native CPL3 GUI windows.
No browser HTML terminal substitutes, kernel rewrite, extra task slots or
shared disk writes. Preserve original images and licences; generate the
optional GUI image from a pinned, clean native commit.

Validate KSH+KSH, KSH+COUNT32 and VIEW32+COUNT32, focus/input, background
execution, memory separation, stop/resume/restart, fault containment, stale
generation rejection, rollback and DOS/GUI teardown with actual CPU/RAM/
screens/pixels and FAT12 hashes. Add PEGC/Cirrus Playwright CI and retain the
existing foundation/legacy tests. Keep draft until acceptance and CI pass.
