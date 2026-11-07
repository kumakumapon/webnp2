# DOS4 PC-98 HDD basic I/O proof

Generate a separate opt-in FD + new disposable FAT16 data HDD, with a pinned
native block driver and DOS probe. Keep bundled production images and existing
user images intact. Validate actual guest DOS writes, exported FAT contents,
capacity and retention after booting a fresh browser context on PEGC/Cirrus.
Include absent/malformed media and bounds checks. Do not modify a running
guest's HDD through host-side FAT APIs. No KGUI32 save routing or HDD-only boot
is included in this first proof. Track acceptance in both PRs and MS-DOS #31.
