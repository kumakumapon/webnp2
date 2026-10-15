import { describe, expect, it } from 'vitest';
import { KdeskMediaLink, KDESK_HEADER_SIZE, KDESK_PALETTE, imageToBmp } from '../src/api/kdesk-media.ts';

function fixture() {
  const ram = new Uint8Array(0xa0000), writes: number[] = [];
  const memory = { read: (address: number, length: number) => ram.slice(address, address + length),
    write: (address: number, bytes: Uint8Array) => { writes.push(address); ram.set(bytes, address); } };
  const put = (address: number, active: number, text = '') => {
    ram.set(new TextEncoder().encode('KDESKCLP'), address);
    const v = new DataView(ram.buffer); v.setUint16(address + 8, 1, true); v.setUint16(address + 10, active, true);
    v.setUint16(address + 12, text.length, true); ram.set(new TextEncoder().encode(text), address + KDESK_HEADER_SIZE);
  };
  return { ram, writes, put, link: new KdeskMediaLink(memory) };
}

describe('KDESK clipboard protocol', () => {
  it('finds the active DOS block, ignores old/exited blocks and preserves ASCII clipboard bytes', () => {
    const f = fixture(); f.put(0x20000, 0, 'old'); f.put(0x40000, 1, 'copy\ntext');
    expect(f.link.readText()).toBe('copy\ntext');
    expect(f.link.find('text')?.address).toBe(0x40000);
  });
  it('publishes complete text and length before signaling the guest, then reads its rejection', () => {
    const f = fixture(); f.put(0x20000, 1);
    expect(f.link.requestTextPaste('A\r\nB\rC')).toBe(0x20000);
    expect(f.writes.at(-1)).toBe(0x20000 + 14);
    expect(new TextDecoder().decode(f.ram.slice(0x20000 + 30, 0x20000 + 36))).toBe('A\nB\nC\0');
    expect(f.link.pasteResult(0x20000)).toEqual({ pending: true, result: 0 });
    f.ram[0x20000 + 14] = 0; f.ram[0x20000 + 20] = 2;
    expect(f.link.pasteResult(0x20000)).toEqual({ pending: false, result: 2 });
  });
  it.each(['日本語', 'X\0Y', '\t', 'A'.repeat(1024)])('rejects unsupported/full text before changing DOS memory (%s)', text => {
    const f = fixture(); f.put(0x20000, 1, 'original');
    expect(() => f.link.requestTextPaste(text)).toThrow(); expect(f.writes).toEqual([]);
    expect(f.link.readText()).toBe('original');
  });
  it('keeps parent text available during EXEC but only accepts image pointers from an active image application', () => {
    const f = fixture(); f.put(0x20000, 2, 'parent'); f.put(0x30000, 4);
    const v = new DataView(f.ram.buffer); v.setUint16(0x30000 + 22, 2, true); v.setUint16(0x30000 + 24, 2, true); v.setUint16(0x30000 + 26, 0x8000, true);
    f.ram.set([1,2,3,4], 0x80000);
    expect(f.link.readText()).toBe('parent'); expect(() => f.link.requestTextPaste('x')).toThrow();
    expect(f.link.readImage()).toEqual({ width: 2, height: 2, pixels: new Uint8Array([1,2,3,4]) });
    v.setUint16(0x30000 + 26, 0x9fff, true); v.setUint16(0x30000 + 22, 320, true);
    expect(() => f.link.readImage()).toThrow();
  });
  it('rejects an overlapping producer command and notices exit before acknowledgement', () => {
    const f = fixture(); f.put(0x20000, 1); f.link.requestTextPaste('one');
    expect(() => f.link.requestTextPaste('two')).toThrow(/pending/);
    f.ram[0x20000 + 10] = 0;
    expect(() => f.link.pasteResult(0x20000)).toThrow(/exited/);
  });
});

describe('browser image conversion for DOS', () => {
  it('writes a padded bottom-up 8-bit BMP, preserving exact palette colors and white transparency', () => {
    const red = KDESK_PALETTE[196], blue = KDESK_PALETTE[21];
    const rgba = new Uint8ClampedArray([...red,255, ...blue,255, 0,0,0,0, ...red,255, ...blue,255, ...red,255]);
    const bmp = imageToBmp(3, 2, rgba), v = new DataView(bmp.buffer);
    expect(Array.from(bmp.slice(0,2))).toEqual([66,77]); expect(v.getUint32(2,true)).toBe(1086);
    expect(v.getUint32(10,true)).toBe(1078); expect(v.getUint16(28,true)).toBe(8);
    expect(Array.from(bmp.slice(1078))).toEqual([196,21,196,0,196,21,7,0]);
    expect(Array.from(bmp.slice(54 + 196*4, 58 + 196*4))).toEqual([0,0,255,0]);
  });
  it('rejects malformed dimensions or short input before allocation', () => {
    expect(() => imageToBmp(321,1,new Uint8ClampedArray(1284))).toThrow();
    expect(() => imageToBmp(320,200,new Uint8ClampedArray(4))).toThrow();
  });
});
