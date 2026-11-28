# CI, source pins and distribution maintenance

Status: maintained. Node 24 LTS is recorded in `.nvmrc` and package engines.
Root and MCP installs use committed lockfiles and `npm ci`. Vite/Vitest and the
MCP runtime are audited in CI. Playwright serves the DOS and protected-mode browser suites. Shared DOS
verifiers use a small adapter that preserves their wait, input, viewport and
assertion contracts.

## One build, all existing browser cases

[WebNP2 CI](../.github/workflows/ci.yml) runs lint, application/test type checks,
incremental checkJs on MCP and CI helpers, unit/tool tests, dependency audits and
the bundled MCP stdio smoke test. A shared [build action](../.github/actions/build/action.yml)
generates the native FD/HDD distribution and the HDD proof once per run, then
builds production assets. The immutable `webnp2-build` artifact supplies every
browser job. No media or production rebuild occurs in the browser jobs.

[Suite definitions](../scripts/ci/suites.json) define 104 cases, including
desktop settings on PEGC and Cirrus. The planner expands
them without shell evaluation. The process owner refuses to run outside Actions,
bounds HTTP readiness and kills its preview/verifier process groups on exit.
Artifacts include real guest diagnostics and use overwrite for failed-job reruns.
Verifiers exercise the real guest, including fault recovery and original-file retention.

PR runs cancel superseded runs. Master, releases and Pages run to completion.
Push validation targets master; other development branches are covered by PRs.
Only the npm download cache is reused across runs; generated media and `dist/`
are passed within the same run, avoiding stale native/source combinations.

## Native pairing

[MS-DOS pairing procedure](https://github.com/kumakumapon/MS-DOS/blob/main/docs/ci-pairing.md)
defines staged updates using immutable commits reachable from the default branch.
The `source_commit` in `scripts/prepare-msdos4-cpanel-ci.sh` identifies the normal,
KDESK/386 and KGUI32 media source. The HDD proof has its separate explicit pin.
Generated manifests preserve exact component commits, clean-source state and
hashes; `dist/ci-build.json` records the web commit, native commit and Actions run.

After native main CI passes, update the web pin, run the full E2E matrix and merge.
Then advance the native emulator pin to the new web master commit and verify
native DOS 2/4 boot again. Do not use a development-only SHA as a release pin.

## Links and managed images

`python3 scripts/msdos4_distribution.py` derives both READMEs and help boot links
from the DOS4 manifest and verifies the image checksum. Both import/update tools
call it with pruning after writing the new manifest. Pruning only removes
unreferenced `public/msdos4/msdos4-retrobasic-<12 hex>.xdf` files; referenced
archives, other filenames, user files and symlinks are retained. Old managed
snapshots remain in Git history. Current shared links should use the boot button.

## Pages and MCP release

A successful master **push** CI run triggers Pages using that exact run's
production artifact. Fork/PR/manual CI artifacts cannot enter that automatic
publish path. Obsolete commits are skipped after comparing against current
master. Manual Pages dispatch on master uses the same shared build action.
See [Pages retry procedure](pages-deployment.md).

MCP releases use the independent locked `mcp/` dependency tree, connection tests,
audit, single-file bundle and stdio smoke test before publishing `mcp-*` tags.
Protocol v0.2 requires the private startup pairing URL; see [MCP setup](../mcp/README.md).


CI compares the committed diff against the base revision. README and docs
Markdown changes run the shared build, static checks, tests and committed boot
link checks. Other changes and manual runs retain the full browser matrix.
The link check reads README contents from Git and media from the generated
artifact, including the actual help page served by Pages.

## Guest CPU clock

Every browser verifier and CI measurement boots the guest with the CPU clock
multiplier from [e2e-clock.mjs](../scripts/e2e-clock.mjs): `clk=32`, the
emulator's maximum. Verifiers wait on guest-produced records instead of fixed
host delays, so the faster guest only shortens those waits. Measured locally on
the same distribution, `verify-kgui32-workspace-shell` (Cirrus) went from
538 s at `clk=8` to 142 s, and `verify-k386-resources` from 111 s to 64 s, with
the same assertions passing. Set `WEBNP2_E2E_CLK` (1–32) to reproduce a run at
another multiplier, for example `WEBNP2_E2E_CLK=8` for the previous speed.

Practical32 input and I/O waits sample compact runtime records. The maximum
image replacement test arms a single-owner in-page observation before sending
input and checks the old front bytes using current guest-owned PTEs. The full
image, Canvas, peer progress and resource recovery assertions remain in place.
