import { isAudioMuted } from './audio.ts';
import { coreMouseMove, coreMousePending, coreReadMemory, coreWriteMemory } from './module.ts';

type Memory = {
  read(address: number, length: number): Uint8Array;
  write(address: number, bytes: Uint8Array): void;
};

const start = 0x10000;
const end = 0xa0000;
const size = 256;
const volumeOffset = 252;
const absoluteOffset = 253;
const signature = new TextEncoder().encode('KG32DRV1');

function identify(view: DataView, offset: number, address: number): number {
  if (!signature.every((byte, i) => view.getUint8(offset + i) === byte)) return 0;
  if (view.getUint16(offset + 8, true) !== 1 || view.getUint16(offset + 10, true) !== size ||
      view.getUint16(offset + 14, true) !== 1 || view.getUint32(offset + 24, true) !== 1 ||
      view.getUint32(offset + 60, true) !== 1 || view.getUint32(offset + 248, true) !== 0x314c4f56) return 0;
  const owner = view.getUint32(offset + 16, true) * 16;
  const runtime = view.getUint32(offset + 64, true);
  if (owner < start || owner > address || address + size > owner + 0x10000 ||
      runtime < owner || runtime >= owner + 0x10000) return 0;
  return view.getUint32(offset + 20, true);
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export class KguiHostStatus {
  private address = 0;
  private cookie = 0;
  private nextSearch = 0;
  private absoluteUntil = 0;

  constructor(private readonly memory: Memory) {}

  sync(muted: boolean, now: number): void {
    if (!this.address && now < this.nextSearch) return;
    try {
      if (this.address) {
        const view = dataView(this.memory.read(this.address, size));
        if (identify(view, 0, this.address) === this.cookie) {
          this.publish(view, 0, muted);
          if (now >= this.absoluteUntil && view.getUint8(absoluteOffset) && coreMousePending() === 0) {
            this.memory.write(this.address + absoluteOffset, Uint8Array.of(0));
          }
          return;
        }
        this.address = this.cookie = 0;
      }
      this.nextSearch = now + 1000;
      const bytes = this.memory.read(start, end - start);
      const view = dataView(bytes);
      let found = -1;
      let cookie = 0;
      for (let i = 0; i <= bytes.length - size; i++) {
        if (bytes[i] !== signature[0]) continue;
        const match = identify(view, i, start + i);
        if (!match) continue;
        if (found >= 0) return;
        found = i;
        cookie = match;
      }
      if (found < 0) return;
      this.address = start + found;
      this.cookie = cookie;
      this.publish(view, found, muted);
    } catch {
      // RAM is unavailable while the emulator is starting or being reset.
      this.address = this.cookie = 0;
      this.nextSearch = now + 1000;
    }
  }

  setAbsolute(enabled: boolean, now: number): void {
    this.absoluteUntil = enabled ? now + 250 : 0;
    if (!this.address) this.sync(isAudioMuted(), now);
    if (!this.address) return;
    try {
      const view = dataView(this.memory.read(this.address, size));
      if (identify(view, 0, this.address) !== this.cookie) {
        this.address = this.cookie = 0;
        return;
      }
      if (view.getUint8(absoluteOffset) !== Number(enabled)) {
        this.memory.write(this.address + absoluteOffset, Uint8Array.of(Number(enabled)));
      }
    } catch {
      this.address = this.cookie = 0;
    }
  }

  private publish(view: DataView, offset: number, muted: boolean): void {
    // Zero means no compatible host. Values 1 through 101 encode 0 through 100 percent.
    const value = muted ? 1 : 101;
    if (view.getUint8(offset + volumeOffset) !== value) {
      this.memory.write(this.address + volumeOffset, Uint8Array.of(value));
    }
  }
}

const kguiStatus = new KguiHostStatus({ read: coreReadMemory, write: coreWriteMemory });
export function syncKguiHostStatus(now: number): void {
  kguiStatus.sync(isAudioMuted(), now);
}


// Absolute host tracking sends screen deltas and must keep its 1:1 calibration.
// The guest still applies its speed preference to the relative PC-98 mouse.
export function moveAbsoluteGuestMouse(dx: number, dy: number): void {
  kguiStatus.setAbsolute(true, performance.now());
  coreMouseMove(dx, dy);
}
export function resumeRelativeGuestMouse(): void {
  kguiStatus.setAbsolute(false, performance.now());
}
