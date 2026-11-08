# KGUI32 applications on HDD

The normal KGUI32 PEGC/Cirrus startup choices now pair a compact boot FD with a
new marked FAT16 HDD. DOS, K386, K32HOST, KGUILDR and KGUI32 remain on FD;
Calculator, Clock, Files, Editor, COUNT32 and ARGS32 live only in `APPS` on HDD.
This is FD boot with HDD applications, not HDD-only boot.

The native manager and PM32 loader use the same application resolver. A bare
8.3 name first checks A:\, then APPS on a KHD98 drive verified through DOS's DPB.
Only missing files permit fallback; invalid packages, devices and I/O errors do
not. Explicit paths retain their existing meaning. DOS CWD/default drive and
V86's A:-only policy are unchanged. ELF/package and ownership checks still apply.
The HDD drive letter is discovered, not hardcoded to B: or C:.

`public/kgui32/manifest.json` records `application_distribution.image`, its SHA256,
FD free capacity, and `application_distribution.hdd` with per-application sizes
and SHA256. The normal startup links select this exact pair. The former complete
FD remains at `manifest.image`; `KGUI32_FD_BOOT_URL` is the explicit standalone
compatibility link. A compact FD without its application HDD cannot launch the
relocated clients: use the complete FD for standalone use.

The new HDD is built offline, never by changing an existing user's volume.
Applications are read-only files. WORK is independent and writable by guest DOS.
Export the HDD as THD to keep documents; reconnect it with the corresponding FD
on the next start. An older workspace HDD lacks APPS: retain its original full FD
pair rather than replacing it with the compact FD. No automatic user-disk upgrade
or formatting occurs. Files still browses the read-only A: root; HDD Files
navigation, recovery UI and Japanese remain later stages.

## Verification

```sh
bash scripts/prepare-msdos4-cpanel-ci.sh
npm ci
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base /webnp2/
# Another terminal; repeat with cirrus.
WEBNP2_NO_SANDBOX=1 node scripts/verify-kgui32-hdd-apps.mjs http://127.0.0.1:4173/webnp2/ test-results/hdd-apps-pegc pegc
```

The dedicated CI runs both PEGC/Cirrus on the shipping pair, asserts every moved
application is absent from FD, exercises actual CPL3 calculator/clock, Files and
Editor, saves/reopens a document across cold boot, verifies quoted PM32 arguments
and restart, rejects missing/corrupt apps and absent/foreign HDDs, and checks
complete memory/vector/handle recovery. Exported bytes are independently checked
for both FAT copies, unshared allocation chains, protected APPS files, WORK
contents and FD invariance. JSON, screenshots and saved THD are CI artifacts.
Existing full-FD and HDD workspace suites remain separate regression coverage.

Track native implementation and integration in MS-DOS #31 and paired #47 PRs.
Keep draft until acceptance and both repository CI pass. Integration order is
MS-DOS, successful main CI, then webnp2; this implementation does not merge them.
