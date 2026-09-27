import { describe, expect, it } from 'vitest';
import { shouldShowHddSlot } from '../src/ui/hdd-visibility.ts';

// shouldShowHddSlot()はHDDスロット行(fd-slotsの3行目)の表示可否を決める純関数。
// 「初期値は非表示」「トグルONで表示」「トグルOFFでも中身があれば表示」の3条件を確認する
// (親からの指示書のとおり: 起動前のペンディングやURLパラメータ経由のHDDも「中身あり」扱い)。

describe('shouldShowHddSlot (src/ui/hdd-visibility.ts)', () => {
  it('トグルOFF・中身なしなら隠す(初期値)', () => {
    expect(shouldShowHddSlot(false, false)).toBe(false);
  });

  it('トグルONなら中身が無くても表示する', () => {
    expect(shouldShowHddSlot(true, false)).toBe(true);
  });

  it('トグルOFFでも中身があれば表示する(セット済み/起動前ペンディング・URLパラメータ経由)', () => {
    expect(shouldShowHddSlot(false, true)).toBe(true);
  });

  it('トグルON・中身ありでも表示する', () => {
    expect(shouldShowHddSlot(true, true)).toBe(true);
  });
});
