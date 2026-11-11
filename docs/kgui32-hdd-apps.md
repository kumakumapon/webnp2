# KGUI32 applications on HDD

The normal KGUI32 PEGC/Cirrus startup choices now pair a compact boot FD with a
new marked FAT16 HDD. DOS, K386, K32HOST, KGUILDR and KGUI32 remain on FD;
Calculator, Clock, Files, Editor, COUNT32 and ARGS32 live only in `APPS` on HDD.
This is FD boot with HDD applications, not HDD-only boot.

The native manager and PM32 loader use the same application resolver. A bare
8.3 name first checks A:\, then APPS on a KHD98 drive verified through DOS's DPB.
Only missing files permit fallback; invalid packages, devices and I/O errors do
not. Explicit paths retain their existing meaning. Host DOS CWD/default drive
remain unchanged. V86 now has private drive/CWD state and read-only access to the same verified HDD; see [V86 HDD reads](v86-hdd-readonly.md).
ELF/package and ownership checks still apply.
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
or formatting occurs. Files now switches between the read-only A: root and Work and can open a selected
TXT in Editor; see [Files / Editor integration](kgui32-files-editor.md).
Editor Tools now provides explicit Work recovery and search/replace, Shift
selection, LF/CRLF selection and expanded text display; see
[Recovery and Editor tools](kgui32-recovery-editor.md). Japanese remains later work.

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

The distribution was merged and verified in both #47 PRs. Files/Editor
integration and recovery were subsequently merged in #49/#50. MS-DOS #31
tracks subsequent work. Integration order remains MS-DOS, successful main CI,
then webnp2, post-merge CI and publication.
