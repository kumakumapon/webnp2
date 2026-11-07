# KGUI32 SDK4 integration

Implementation: synchronize the native SDK4 source, provision an
isolated `A:\WORK` directory for `.TXT` saves, expose the editor save workflows
and validate actual FAT/file changes with Playwright on PEGC and Cirrus.
Root boot files and saved user disks must remain intact. Keep legacy read-only
regression tests; new save tests use isolated disposable images.

Publish only after native implementation/CI and browser acceptance pass. Merge
MS-DOS first, wait for its main CI, then merge this repository and check Pages.

Acceptance and merge results: [MS-DOS #44](https://github.com/kumakumapon/MS-DOS/pull/44) / [WebNP2 #44](https://github.com/kumakumapon/webnp2/pull/44).
