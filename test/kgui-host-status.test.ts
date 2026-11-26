import { describe, expect, it } from 'vitest';
import { KguiHostStatus } from '../src/core/kgui-host-status.ts';

function guest() {
  const ram = new Uint8Array(0xa0000);
  const writes: number[] = [];
  const status = new KguiHostStatus({
    read: (address, length) => ram.slice(address, address + length),
    write: (address, bytes) => { writes.push(address); ram.set(bytes, address); },
  });
  function install(address: number, cookie: number, tagged = true) {
    const owner = address - 0x200;
    ram.set(new TextEncoder().encode('KG32DRV1'), address);
    const record = new DataView(ram.buffer, address, 256);
    record.setUint16(8, 1, true);
    record.setUint16(10, 256, true);
    record.setUint16(14, 1, true);
    record.setUint32(16, owner / 16, true);
    record.setUint32(20, cookie, true);
    record.setUint32(24, 1, true);
    record.setUint32(60, 1, true);
    record.setUint32(64, owner + 0x4000, true);
    if (tagged) record.setUint32(248, 0x314c4f56, true);
    return record;
  }
  return {status, writes, ram, install};
}

describe('KGUI32 host status mailbox', () => {
  it('writes one volume byte and preserves the absolute mouse flag', () => {
    const g = guest(), address = 0x30000;
    g.install(address, 21);
    g.status.sync(false, 0);
    g.status.setAbsolute(true, 10);
    g.status.sync(true, 20);
    g.status.sync(true, 30);
    expect(g.writes).toEqual([address + 252, address + 253, address + 252]);
    expect([...g.ram.slice(address + 252, address + 256)]).toEqual([1, 1, 0, 0]);
    g.status.setAbsolute(false, 35);
    expect(g.ram[address + 253]).toBe(0);
  });

  it('ignores old, stopped and ambiguous records and follows a new session', () => {
    const g = guest(), old = 0x30000, next = 0x50000, other = 0x70000;
    g.install(old, 20, false);
    g.status.sync(false, 0);
    expect(g.writes).toEqual([]);
    const active = g.install(old, 21);
    g.status.sync(false, 1000);
    active.setUint16(14, 0, true);
    g.install(next, 22);
    const duplicate = g.install(other, 23);
    g.status.sync(true, 1010);
    expect(g.writes).toEqual([old + 252]);
    duplicate.setUint32(60, 0, true);
    g.status.sync(true, 2010);
    expect(g.writes).toEqual([old + 252, next + 252]);
    expect(g.ram[next + 252]).toBe(1);
  });
});
