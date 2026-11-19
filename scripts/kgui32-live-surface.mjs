// Runs in Chromium. Resolve current GUI pages through the resident driver's CR3
// and verify that their physical pages belong to the same GUI allocation.
/** @param {{address: number, cookie: number, manager: number, capacity: number, id: number,
 * previous?: {generation: number, token: number, handle: number, revision: number, front: number, bytes: number}}} input */
export function sampleGuiSurface({ address, cookie, manager, capacity, id, previous }) {
  const np2 = window.np2debug?.np2;
  const heap = window.Module?.HEAPU8;
  if (!np2 || !heap) return null;
  const read = (physical, size) => atob(np2.readMemoryBase64(physical, size).base64);
  const word = (s, i) => s.charCodeAt(i) | s.charCodeAt(i + 1) << 8;
  const dword = (s, i) => (word(s, i) | word(s, i + 2) << 16) >>> 0;
  const driver = read(address, 256);
  if (driver.slice(0, 8) !== 'KG32DRV1' || dword(driver, 20) !== cookie || !word(driver, 14)) return null;
  const runtime = read(dword(driver, 64), 1024);
  const pd = dword(runtime, 24), physicalBase = dword(runtime, 28);
  if (!pd || !word(runtime, 40) || !word(runtime, 42) || dword(runtime, 944) !== 16) return null;
  const table = read(pd + 8192, 4096);
  let statsPage = 0;
  for (let i = 0; i < 4096; i += 4) {
    const entry = dword(table, i);
    if ((entry & 7) === 7) { statsPage = entry & 0xfffff000; break; }
  }
  const owned = physical => physical >= physicalBase && physical + 4096 <= physicalBase + 0x400000;
  if (!statsPage || !owned(statsPage)) return null;

  let backing = window.kguiTerminalXmsBacking;
  const matches = at => at >= 0 && at + 256 <= heap.length &&
    heap[at] === 0x4b && heap[at + 1] === 0x55 && heap[at + 2] === 0x47 && heap[at + 3] === 0x31 &&
    heap[at + 64] === 0x4b && heap[at + 65] === 0x47 && heap[at + 66] === 0x54 && heap[at + 67] === 0x32;
  if (backing === undefined || !matches(backing + statsPage)) {
    const found = [];
    for (let at = heap.indexOf(0x4b); at >= 0; at = heap.indexOf(0x4b, at + 1)) {
      if (!matches(at)) continue;
      if (Array.from({length: 64}, (_, i) => heap[at + i] === runtime.charCodeAt(880 + i)).every(Boolean)) found.push(at);
    }
    if (found.length !== 1) return null;
    backing = found[0] - statsPage;
    window.kguiTerminalXmsBacking = backing;
  }
  const stats = new DataView(heap.buffer, heap.byteOffset + backing + statsPage, 256);
  const u = offset => stats.getUint32(offset, true);
  if (u(192) !== 0x3153474b || u(132) !== capacity || id < 0 || id >= capacity) return null;
  const offset = id < 2 ? 84 + id * 24 : 144 + (id - 2) * 24;
  const windowRect = {x:u(offset), y:u(offset + 4), w:u(offset + 8), h:u(offset + 12)};
  if (!previous) return {window: windowRect};

  const mux = read(manager, 264);
  if (mux.slice(0, 8) !== 'K32MUX02' || word(mux, 258) !== capacity ||
      dword(mux, 168 + id * 4) !== previous.generation) return null;
  const uploaded = dword(driver, 200 + id * 4);
  // Acknowledging one chunk can clear pending while the replacement is still partial.
  if (!uploaded || uploaded >= previous.bytes ||
      dword(driver, 232 + id * 4) !== previous.generation ||
      dword(driver, 184 + id * 4) !== previous.handle) return null;

  function visit(ptr, size, consume) {
    if (ptr < 0x800000 || ptr + size > 0xc00000) return false;
    while (size) {
      const pte = dword(table, ((ptr - 0x800000) >>> 12) * 4), physical = pte & 0xfffff000;
      const offset = ptr & 4095, length = Math.min(size, 4096 - offset);
      const at = backing + physical + offset;
      if ((pte & 5) !== 5 || !owned(physical) || at < 0 || at + length > heap.length) return false;
      consume(heap.subarray(at, at + length));
      ptr += length;
      size -= length;
    }
    return true;
  }

  const metadata = new DataView(new ArrayBuffer(36));
  let at = 0;
  if (!visit(u(196) + id * 36, 36, chunk => {
    new Uint8Array(metadata.buffer).set(chunk, at);
    at += chunk.length;
  })) return null;
  const m = offset => metadata.getUint32(offset, true);
  if (!m(32) || m(0) !== previous.generation || m(4) !== previous.token ||
      m(8) !== previous.handle || m(12) * m(16) * 2 !== previous.bytes ||
      m(24) !== previous.revision || m(28) !== previous.front) return null;
  const stride = u(204);
  if (![196608, 393216].includes(stride) || previous.bytes > stride / 2) return null;
  let hash = 2166136261;
  if (!visit(u(200) + id * stride + m(28) * (stride / 2), previous.bytes, chunk => {
    for (const byte of chunk) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  })) return null;
  return {window: windowRect, uploaded, hash, generation: m(0), token: m(4)};
}
