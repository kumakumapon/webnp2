# KGUI32 HDD workspace integration

> Status: archived development/acceptance record. Preserved scope and baseline
> references are historical; use [the documentation index](https://github.com/kumakumapon/webnp2/blob/master/docs/README.md)
> for current supported behavior and the repository issues for active work.

Generate and ship a coordinated GUI FD + marked 40 MB data HDD using a pinned
native commit. Launch the HDD-enabled GUI through the existing WebNP2 GUI entry
point; preserve explicit FD-only operation and existing stored user disks.
Keep the basic HDD proof profile available. Never edit FAT from the host while
the guest is running.

Verify the actual guest Editor, common Open/Save picker, workspace information,
64 KiB creates/repeated overwrites, exported FAT contents and fresh-context
retention in PEGC/Cirrus. Include full disk, failed I/O, missing/unsupported HDD,
FD fallback and protection of existing files. Maintain source/dirty/size/hash
manifests and normal regressions. Update issue #31 and both PRs with evidence.
No application relocation or HDD-only boot is included in this stage.
