import { describe, expect, it } from 'vitest';
import { fitSubScale, pickUpscale } from '../src/ui/player.ts';

/**
 * 1倍未満スケールの決め方。
 * 狙いは「物理ピクセルで整数倍に乗るならスナップして pixelated を保つ。
 * 乗せると画面を大きく捨てるなら端数のまま補間へ落とす」。
 */
describe('fitSubScale', () => {
  it('物理ちょうど整数倍ならそのまま、補間しない (DPR3 の 2/3)', () => {
    const r = fitSubScale(2 / 3, 3);
    expect(r.smooth).toBe(false);
    expect(r.scale * 3).toBeCloseTo(2, 6);
  });

  it('物理整数倍をわずかに超えるだけなら切り下げてスナップする', () => {
    // deviceScale = 2.04 → ロス約2%。切り下げても画面はほぼ減らない。
    const r = fitSubScale(0.68, 3);
    expect(r.smooth).toBe(false);
    expect(r.scale).toBeCloseTo(2 / 3, 6);
  });

  it('切り下げると画面を大きく捨てる場合は端数を保ち補間へ落とす', () => {
    // deviceScale = 1.98 → 1倍まで落とすと面積が半分になる。捨てない。
    const r = fitSubScale(0.66, 3);
    expect(r.smooth).toBe(true);
    expect(r.scale).toBe(0.66);
  });

  it('DPR1 で1倍未満なら物理整数倍に乗せる余地が無く補間になる', () => {
    const r = fitSubScale(0.66, 1);
    expect(r.smooth).toBe(true);
    expect(r.scale).toBe(0.66);
  });

  it('DPR2 でも同じ規則が効く', () => {
    expect(fitSubScale(0.52, 2)).toEqual({ scale: 0.5, smooth: false });
    expect(fitSubScale(0.9, 2).smooth).toBe(true);
  });

  it('DPR が 0/未定義でも 1 とみなして落ちない', () => {
    expect(fitSubScale(0.5, 0).scale).toBe(0.5);
    expect(fitSubScale(1, 0)).toEqual({ scale: 1, smooth: false });
  });

  it('スナップ結果は元のスケールを超えない (はみ出させない)', () => {
    for (const dpr of [1, 2, 2.625, 3]) {
      for (let raw = 0.3; raw < 1; raw += 0.01) {
        expect(fitSubScale(raw, dpr).scale).toBeLessThanOrEqual(raw + 1e-9);
      }
    }
  });
});

/**
 * 1倍以上スケールの決め方 (pickUpscale)。
 * 狙いは「整数倍の近く(目標サイズ基準で16px以内)なら吸着してドットのまま、
 * それ以外は縦横比を保った端数倍でシャープ・バイリニア表示に委ねる」。
 */
describe('pickUpscale', () => {
  it('1673x1232ウィンドウ相当の1.917倍(640x480)は端数のまま補間', () => {
    // n=2 との差0.083 * 640 ≒ 53px > 16px なので吸着しない。
    const r = pickUpscale(1.917, 640, 480);
    expect(r.smooth).toBe(true);
    expect(r.scale).toBe(1.917);
  });

  it('1.98倍(640x480, 差12.8px)は2倍に吸着する', () => {
    const r = pickUpscale(1.98, 640, 480);
    expect(r.smooth).toBe(false);
    expect(r.scale).toBe(2);
  });

  it('2.03倍(低解像度512x400画面, 差約15.4px)は2倍に吸着する(切り上げ方向も許す)', () => {
    const r = pickUpscale(2.03, 512, 400);
    expect(r.smooth).toBe(false);
    expect(r.scale).toBe(2);
  });

  it('ちょうど1.0倍はそのまま1倍', () => {
    expect(pickUpscale(1.0, 640, 480)).toEqual({ scale: 1, smooth: false });
  });

  it('ちょうど2.0倍はそのまま2倍', () => {
    expect(pickUpscale(2.0, 640, 480)).toEqual({ scale: 2, smooth: false });
  });

  it('1.5倍(640x480)は中途半端で端数のまま補間', () => {
    const r = pickUpscale(1.5, 640, 480);
    expect(r.smooth).toBe(true);
    expect(r.scale).toBe(1.5);
  });

  it('ドット等倍640x400で1.975倍(差16px/10px)は2倍に吸着する', () => {
    const r = pickUpscale(1.975, 640, 400);
    expect(r.smooth).toBe(false);
    expect(r.scale).toBe(2);
  });
});
