# High-color background progress validation

Postmerge run 40722907504 failed only `kdesk-highcolor`, waiting for both DOS
counters to exceed the pre-layout snapshot. RGB565 initialization, rendering,
window operations and all ten other browser jobs passed.

The test reads CPU and resource records in separate emulator turns. At the
KSH -> COUNTER EXEC boundary, a CPU sample can still describe the parent shell
while the later resource sample already names COUNTER.EXE. The shell's scratch
word is ordinary program data. The old predicate accepted it as a counter merely
because it was nonzero, potentially setting a baseline the actual counter could
not reach within the test timeout.

`scripts/k386-counter-progress.mjs` requires both running COUNTER children,
matching CPU/resource PSPs and the child's own startup output. A second sample
must demonstrate actual execution before it becomes the layout baseline. Later
samples must retain PSPs, physical RAM, page tables and generations and show
both run/CPU-time increases and unsigned forward counter movement, including
wrap. Paused, replaced, faulted or non-progressing contexts still fail.

The same checks apply with DOS windows hidden. The 90-second timeout, real V86
execution, RGB565/mouse/window checks and unchanged-disk assertions are retained.
No guest runtime, kernel or emulator change is required. `failure-state.json`
preserves the latest samples and startup/layout baselines if a wait fails again.

Run `npm test` for the mixed-parent/child, startup, stopped/replaced context and
wrap regressions. After generating the pinned images and building the site, run
`node scripts/verify-kdesk-highcolor.mjs URL OUTPUT` for the actual Chromium,
800x600 RGB565 desktop and two real V86 applications.
