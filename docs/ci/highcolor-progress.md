# High-color progress validation

Postmerge run 40722907504 failed only `kdesk-highcolor`, waiting for both DOS
counters to exceed the pre-layout snapshot. RGB565 initialization, rendering and
window operations completed, and all ten other browser jobs passed.

Investigate actual CPU/resource snapshots before changing the progress check.
Retain real V86 execution, address-space separation, retained generation and
unchanged-disk assertions. Verify the repair in Chromium and CI.
