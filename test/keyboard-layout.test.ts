import { describe, expect, it } from 'vitest';
import { createJisKeyboard, loadKeyboardLayout, resolveJisKey, saveKeyboardLayout } from '../src/api/keyboard-layout.ts';
import { SharedKeyInput } from '../src/api/shared-key-input.ts';
import { NAMED_KEYS } from '../src/api/keymap.ts';

describe('Japanese physical keyboard', () => {
  it('maps punctuation positions that differ from US and the two Japanese extra keys', () => {
    expect(['Equal','BracketLeft','BracketRight','Quote','Backslash','IntlYen','IntlRo'].map(resolveJisKey))
      .toEqual([0x0c,0x1a,0x1b,0x27,0x28,0x0d,0x33]);
    expect(resolveJisKey('Digit2')).toBe(0x02);
    expect(resolveJisKey('F12')).toBeUndefined();
  });
  it('persists explicit layout and tolerates unavailable or malformed storage', () => {
    let value: string | null = null;
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    expect(loadKeyboardLayout(storage)).toBe('jis');
    saveKeyboardLayout('us', storage); expect(loadKeyboardLayout(storage)).toBe('us');
    value = 'garbage'; expect(loadKeyboardLayout(storage, 'us')).toBe('us');
    expect(loadKeyboardLayout({ getItem: () => { throw Error(); } })).toBe('jis');
  });
  it('shares modifiers and releases held keys even after layout/focus changes', () => {
    const events: Array<[number, boolean]> = [];
    const input = new SharedKeyInput((code, down) => events.push([code, down]));
    let layout: 'jis' | 'us' = 'jis', ime = 0, taken = 0;
    const keyboard = createJisKeyboard(() => layout, input, () => ime++);
    const event = (code: string, extra = {}) => ({ code, target: null, repeat: false,
      preventDefault: () => taken++, stopImmediatePropagation() {}, ...extra } as unknown as KeyboardEvent);
    keyboard.onKeyDown(event('ShiftLeft')); keyboard.onKeyDown(event('ShiftRight'));
    keyboard.onKeyUp(event('ShiftLeft')); expect(events).toEqual([[NAMED_KEYS.SHIFT,true]]);
    keyboard.onKeyDown(event('Digit2')); keyboard.onKeyDown(event('Digit2', { repeat: true }));
    layout = 'us'; keyboard.onKeyUp(event('Digit2')); keyboard.releaseAll();
    expect(events).toEqual([[0x70,true],[0x02,true],[0x02,false],[0x70,false]]);
    const previous = taken;
    keyboard.onKeyDown(event('KeyA')); expect(taken).toBe(previous); // US SDL path
    layout = 'jis'; keyboard.onKeyDown(event('Backquote')); expect(ime).toBe(1);
    keyboard.onKeyDown(event('KeyA', { isComposing: true, keyCode: 229 }));
    expect(events.at(-1)).toEqual([0x70,false]);
  });
});
