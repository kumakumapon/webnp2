// CPU clock multiplier shared by every browser verifier and CI measurement.
// The emulator accepts 1..32 (src/core/module.ts). Verifiers wait on
// guest-produced records rather than fixed host delays, so a faster guest
// shortens each wait without changing what is asserted. 16 is the default:
// two full CI runs at 32 failed three to five different cases per run on
// KGUI32 and observer races (see docs/ci-maintenance.md).
// WEBNP2_E2E_CLK reproduces a run at another multiplier, e.g. 8 for the
// previous speed when investigating timing-sensitive behaviour locally.
const requested = process.env.WEBNP2_E2E_CLK ?? '16';
if (!/^(?:[1-9]|[12]\d|3[0-2])$/.test(requested)) throw new Error('WEBNP2_E2E_CLK must be an integer from 1 to 32');
export const E2E_CLOCK = Number(requested);
