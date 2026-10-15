import { coreReadMemory, coreWriteMemory } from '../core/module.ts';

export const KDESK_HEADER_SIZE = 30;
export const KDESK_TEXT_CAPACITY = 1024;
const signature = new TextEncoder().encode('KDESKCLP');
export type GuestMemory = { read(address: number, length: number): Uint8Array; write(address: number, bytes: Uint8Array): void };
const runtimeMemory: GuestMemory = { read: coreReadMemory, write: coreWriteMemory };
export type KdeskClipboard = { address: number; active: number; length: number; command: number; width: number; height: number; segment: number };

export class KdeskMediaLink {
  constructor(private readonly memory: GuestMemory = runtimeMemory) {}
  find(kind: 'text' | 'image'): KdeskClipboard | null {
    // The DOS application owns the mailbox inside its conventional-memory block.
    // Do not reserve BIOS RAM, install a TSR, or retain pointers across an EXEC.
    const start = 0x1000, bytes = this.memory.read(start, 0xa0000 - start);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let suspended: KdeskClipboard | null = null;
    for (let i = 0; i + KDESK_HEADER_SIZE + KDESK_TEXT_CAPACITY <= bytes.length; i++) {
      if (bytes[i] !== signature[0] || !signature.every((value, j) => bytes[i + j] === value)) continue;
      if (view.getUint16(i + 8, true) !== 1) continue;
      const active = view.getUint16(i + 10, true), length = view.getUint16(i + 12, true);
      if (active < 1 || active > 4 || length >= KDESK_TEXT_CAPACITY) continue;
      if (kind === 'text' && active > 2 || kind === 'image' && active < 3) continue;
      const found = { address: start + i, active, length, command: view.getUint16(i + 14, true),
        width: view.getUint16(i + 22, true), height: view.getUint16(i + 24, true), segment: view.getUint16(i + 26, true) };
      if (active === 2) suspended = found; else return found;
    }
    return suspended;
  }
  readText(): string {
    const box = this.find('text');
    if (!box) throw new Error('KDESK clipboard is not available. Start KDESK and copy from Memo.');
    if (box.command === 0xfffe) throw new Error('KDESK is copying text. Try again when it finishes.');
    return new TextDecoder('ascii').decode(this.memory.read(box.address + KDESK_HEADER_SIZE, box.length));
  }
  requestTextPaste(text: string): number {
    const box = this.find('text');
    if (!box || box.active !== 1) throw new Error('Start KDESK to paste into Memo.');
    if (box.command) throw new Error('The previous clipboard operation is still pending.');
    const normalized = text.replace(/\r\n?/g, '\n');
    if (!/^[\x20-\x7e\n]*$/.test(normalized)) throw new Error('Memo accepts ASCII text. Use the text editor for Japanese.');
    if (normalized.length >= KDESK_TEXT_CAPACITY) throw new Error('Memo clipboard is limited to 1023 characters.');
    const payload = new TextEncoder().encode(normalized + '\0');
    this.memory.write(box.address + KDESK_HEADER_SIZE, payload);
    const length = new Uint8Array(2); new DataView(length.buffer).setUint16(0, normalized.length, true);
    this.memory.write(box.address + 12, length);
    this.memory.write(box.address + 20, new Uint8Array(2));
    // Publish the command last. The guest validates capacity before editing Memo.
    this.memory.write(box.address + 14, new Uint8Array([1, 0]));
    return box.address;
  }
  pasteResult(address: number): { pending: boolean; result: number } {
    const bytes = this.memory.read(address, KDESK_HEADER_SIZE);
    if (!signature.every((value, j) => bytes[j] === value) || bytes[10] !== 1)
      throw new Error('KDESK exited before the clipboard operation completed.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { pending: view.getUint16(14, true) !== 0, result: view.getUint16(20, true) };
  }
  readImage(): { width: number; height: number; pixels: Uint8Array } {
    const box = this.find('image');
    if (!box || box.width < 1 || box.width > 320 || box.height < 1 || box.height > 200 ||
        box.segment < 0x1000 || box.segment * 16 + box.width * box.height > 0xa0000)
      throw new Error('Open an image in KVIEW/KPAINT, or copy a selection in KPAINT.');
    return { width: box.width, height: box.height, pixels: this.memory.read(box.segment * 16, box.width * box.height) };
  }
}

const theme = [0x234,0x256,0xeff,0xcde,0x27b,0x259,0xfc6,0xfff,0x123,0xbcd,0x678,0x467,0x367,0x7ab,0xeef,0xacd];
export const KDESK_PALETTE: readonly (readonly number[])[] = [
  ...theme.map(c => [(c >> 8) * 17, ((c >> 4) & 15) * 17, (c & 15) * 17]),
  ...Array.from({ length: 216 }, (_, i) => [Math.floor(i / 36) * 51, Math.floor(i / 6) % 6 * 51, i % 6 * 51]),
  ...Array.from({ length: 24 }, (_, t) => [24 + t, 64 + t * 2, 88 + t * 2]),
];
export function imageToBmp(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || width > 320 || height < 1 || height > 200 || rgba.length !== width * height * 4)
    throw new Error('Image must fit within 320×200 pixels.');
  const stride = (width + 3) & ~3, data = new Uint8Array(1078 + stride * height), view = new DataView(data.buffer);
  data.set([66, 77]); view.setUint32(2, data.length, true); view.setUint32(10, 1078, true);
  view.setUint32(14, 40, true); view.setInt32(18, width, true); view.setInt32(22, height, true);
  view.setUint16(26, 1, true); view.setUint16(28, 8, true); view.setUint32(34, stride * height, true); view.setUint32(46, 256, true);
  KDESK_PALETTE.forEach(([r,g,b], i) => data.set([b,g,r,0], 54 + i * 4));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4, alpha = rgba[at + 3] / 255;
    const rgb = [0,1,2].map(i => Math.round(rgba[at + i] * alpha + 255 * (1 - alpha)));
    let best = 16 + Math.round(rgb[0] / 51) * 36 + Math.round(rgb[1] / 51) * 6 + Math.round(rgb[2] / 51), distance = Infinity;
    // Include the UI and gradient colors so native load/save preserves this palette.
    KDESK_PALETTE.forEach((p, i) => {
      const d = p.reduce((n, c, j) => n + (c - rgb[j]) ** 2, 0);
      if (d < distance) { distance = d; best = i; }
    });
    data[1078 + (height - y - 1) * stride + x] = best;
  }
  return data;
}
