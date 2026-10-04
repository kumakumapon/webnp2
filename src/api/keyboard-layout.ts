import { charToKey, NAMED_KEYS } from './keymap.ts';
import type { SharedKeyInput } from './shared-key-input.ts';

export type KeyboardLayout = 'jis' | 'us';
const STORAGE_KEY = 'webnp2.keyboard-layout';
export function loadKeyboardLayout(storage: Pick<Storage, 'getItem'>, fallback: KeyboardLayout = 'jis'): KeyboardLayout {
  try { const value = storage.getItem(STORAGE_KEY); return value === 'jis' || value === 'us' ? value : fallback; }
  catch { return fallback; }
}
export function saveKeyboardLayout(layout: KeyboardLayout, storage: Pick<Storage, 'setItem'>): void {
  try { storage.setItem(STORAGE_KEY, layout); } catch { /* private browsing */ }
}

// Physical Japanese 106/109 keys map to the corresponding PC-98 JIS keys.
// US mode retains the existing SDL keyboard translation.
const JIS: Record<string, number> = {
  Minus: 0x0b, Equal: 0x0c, IntlYen: 0x0d,
  BracketLeft: 0x1a, BracketRight: 0x1b, Semicolon: 0x26,
  Quote: 0x27, Backslash: 0x28, IntlRo: 0x33,
  Comma: 0x30, Period: 0x31, Slash: 0x32,
  Space: NAMED_KEYS.SPACE, Enter: NAMED_KEYS.ENTER, Backspace: NAMED_KEYS.BS,
  Tab: NAMED_KEYS.TAB, Escape: NAMED_KEYS.ESC, Home: NAMED_KEYS.HOME, End: NAMED_KEYS.HELP,
  ArrowUp: NAMED_KEYS.UP, ArrowDown: NAMED_KEYS.DOWN,
  ArrowLeft: NAMED_KEYS.LEFT, ArrowRight: NAMED_KEYS.RIGHT,
  PageUp: NAMED_KEYS.ROLLUP, PageDown: NAMED_KEYS.ROLLDOWN,
  Insert: NAMED_KEYS.INS, Delete: NAMED_KEYS.DEL,
  ShiftLeft: NAMED_KEYS.SHIFT, ShiftRight: NAMED_KEYS.SHIFT,
  ControlLeft: NAMED_KEYS.CTRL, ControlRight: NAMED_KEYS.CTRL,
  AltLeft: NAMED_KEYS.GRPH, AltRight: NAMED_KEYS.GRPH,
  CapsLock: NAMED_KEYS.CAPS, KanaMode: NAMED_KEYS.KANA,
  Convert: NAMED_KEYS.XFER, NonConvert: NAMED_KEYS.NFER,
  NumpadEnter: NAMED_KEYS.ENTER, NumpadDecimal: NAMED_KEYS.KP_PERIOD,
  NumpadAdd: NAMED_KEYS.KP_PLUS, NumpadSubtract: NAMED_KEYS.KP_MINUS,
  NumpadMultiply: NAMED_KEYS.KP_MULTIPLY, NumpadDivide: NAMED_KEYS.KP_DIVIDE,
};
for (let i = 0; i < 10; i++) {
  JIS[`Digit${i}`] = charToKey(String(i))!.code;
  JIS[`Numpad${i}`] = NAMED_KEYS[`KP${i}`];
}
for (let i = 1; i <= 10; i++) JIS[`F${i}`] = NAMED_KEYS[`F${i}`];
for (const letter of 'abcdefghijklmnopqrstuvwxyz') JIS[`Key${letter.toUpperCase()}`] = charToKey(letter)!.code;

export function resolveJisKey(code: string): number | undefined { return JIS[code]; }

/** Capture must leave browser IME fields and input-setting dialogs alone. */
export function isBrowserInput(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element && !!target.closest('input,textarea,select,[contenteditable],.rom-modal');
}

export function createJisKeyboard(
  getLayout: () => KeyboardLayout,
  input: Pick<SharedKeyInput, 'press' | 'releaseSource'>,
  openIme: () => void,
) {
  const held = new Set<string>();
  const take = (e: KeyboardEvent) => { e.preventDefault(); e.stopImmediatePropagation(); };
  return {
    onKeyDown(e: KeyboardEvent): void {
      if (getLayout() !== 'jis' || isBrowserInput(e.target) || e.metaKey) return;
      if (e.code === 'Backquote' || e.key === 'ZenkakuHankaku') { take(e); if (!e.repeat) openIme(); return; }
      if (e.isComposing || e.keyCode === 229 || e.key === 'Process') {
        take(e); return; // uncommitted composition never enters the guest
      }
      const code = resolveJisKey(e.code);
      if (code === undefined) return;
      take(e);
      if (!e.repeat) { held.add(e.code); input.press(`jis:${e.code}`, code); }
    },
    onKeyUp(e: KeyboardEvent): void {
      if (!held.delete(e.code)) return;
      take(e); input.releaseSource(`jis:${e.code}`);
    },
    releaseAll(): void {
      for (const code of held) input.releaseSource(`jis:${code}`);
      held.clear();
    },
  };
}
