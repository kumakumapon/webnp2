# Application XMS integration plan

Integrate the isolated guest-side XMS data API from MS-DOS PR #29. Pin the
verified source commit, bundle its diagnostic EXE, and exercise actual allocation,
transfers above 64 KiB, simultaneous session isolation, range/ownership rejection,
and lifecycle cleanup in WebNP2 using Playwright. Keep existing desktop, CPU,
process, resource, high-color and native-tool regressions as gates.

This adds guest services and test coverage; no browser-hosted app windows or CPU
core changes are planned. A full 32-bit application executable ABI is outside
this increment. Record premerge CI and postmerge CI distinctly.
