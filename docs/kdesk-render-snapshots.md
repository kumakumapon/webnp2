# Coherent KDESK rendering snapshots

The PEGC render-load CI sometimes captured background DOS counter text as the
expected foreground Memo. A later snapshot then contained the restored Memo,
causing an exact comparison to fail. Waiting for three Memo lines or adding a
delay was insufficient: a new incremental update could start after that wait.

Incremental native DOS updates temporarily replace logical text VRAM before
restoring the occluders. They now hold KDPERF01 busy through restoration and
presentation. Partial drawing, resource drawing and live drag use the same
nested busy counter. The optional record is still version 1 / 64 bytes; offset
52 now counts actual incremental DOS repaints, using a previously reserved word.
The implementation lives in MS-DOS tools/window, outside the original kernel.

`scripts/kdesk-render-snapshot.mjs` reads the idle producer, both logical text
planes and protected pixels in one synchronous browser evaluation. It checks
signature, version, size, ready, busy, identity, geometry and bounds, and rejects
a header changed by the end of the read. Invalid/busy data never becomes a valid
snapshot. Transport failures propagate instead of being mistaken for idle data.
This relies on the emulator executing on the same browser thread.

The E2E captures expected Memo contents while the printing peer is paused.
It moves the window by odd pixel offsets, resumes the DOS counter and checks
every accepted snapshot byte for byte. At least eight snapshots, three native
DOS repaints, two clock preservation updates and continuing CPU progress must
complete. Hide/restore also checks all protected text, attributes and pixels.
The comparisons and timing limits have not been relaxed. No retry accepts a
corrupted comparison simply because it becomes stable later.

```
bash scripts/prepare-msdos4-cpanel-ci.sh
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
WEBNP2_NO_SANDBOX=1 node scripts/measure-k386-render-load.mjs http://127.0.0.1:4173/ test-results/render-pegc changed pegc
WEBNP2_NO_SANDBOX=1 node scripts/measure-k386-render-load.mjs http://127.0.0.1:4173/ test-results/render-cirrus changed cirrus
```

The 12 snapshot-reader tests reject busy/stale/malformed producers, changed
publication and invalid rectangles, and verify both character and attribute
planes and the protected pixels. Existing CPU/file/input latency, full-scene,
background progress and whole-disk hash assertions remain in the browser suite.
CI uses the same pinned clean MS-DOS commit for ordinary, K386 and KGUI32 images.
Generated images, manifests and licence output are not committed; saved user
disks are not changed.
