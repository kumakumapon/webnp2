// CPU clock multiplier shared by every browser verifier and CI measurement.
// 32 is the emulator's upper bound (src/core/module.ts clamps clk to 1..32).
// Verifiers wait on guest-produced records rather than fixed host delays, so a
// faster guest shortens each wait without changing what is asserted.
// WEBNP2_E2E_CLK reproduces a run at another multiplier, e.g. 8 for the
// previous speed when investigating timing-sensitive behaviour locally.
const requested = process.env.WEBNP2_E2E_CLK ?? '32';
if (!/^(?:[1-9]|[12]\d|3[0-2])$/.test(requested)) throw new Error('WEBNP2_E2E_CLK must be an integer from 1 to 32');
export const E2E_CLOCK = Number(requested);
