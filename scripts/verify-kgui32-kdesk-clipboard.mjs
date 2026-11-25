import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toolsHarness, fnv} from './kgui32-tools-harness.mjs';
import {assertHddProtected} from './kgui32-hdd-fat.mjs';

const [base = 'http://127.0.0.1:4173/webnp2/', output = 'test-results/kgui32-kdesk-clipboard', video = 'pegc'] =
  process.argv.slice(2);
const h = await toolsHarness(base, output, video);
const image = state => state.cpu.diagnostics[0]?.pm32?.samples;
const path = 'WORK/KGCLIP.BMP';

async function screen(message) {
  console.log('CHECK', message);
  const found = await h.page().waitForFunction(message => {
    try { return window.np2debug.np2.getScreenText().text.includes(message); }
    catch { return false; }
  }, message, {timeout: 90000});
  await found.dispose();
}

async function openImages() {
  await h.key('CTRL+K');
  await h.type('images');
  await h.key('ENTER');
  return h.until(s => s.bridge.tokens[0] && image(s)?.[0] === 0x3149474b &&
    image(s)[2] && s.canvases[0]?.controls.includes(111), 'Images guest canvas');
}

function rgb565(bitmap, bpp, width, height) {
  assert.equal(bitmap.toString('ascii', 0, 2), 'BM');
  assert.equal(bitmap.readUInt16LE(28), bpp);
  assert.deepEqual([bitmap.readInt32LE(18), bitmap.readInt32LE(22)], [width, height]);
  const offset = bitmap.readUInt32LE(10);
  const stride = (width * (bpp / 8) + 3) & ~3;
  const pixels = Buffer.alloc(width * height * 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = offset + (height - 1 - y) * stride + x * (bpp / 8);
    const i = bpp === 8 ? 54 + bitmap[at] * 4 : at;
    pixels.writeUInt16LE((bitmap[i + 2] >> 3) << 11 | (bitmap[i + 1] >> 2) << 5 | bitmap[i] >> 3, (y * width + x) * 2);
  }
  return pixels;
}

try {
  const fixture = await readFile(new URL('../public/kgui32/' + h.manifest.standalone_hdd.image, import.meta.url));
  const vector = await h.bootHdd(fixture);
  const first = await openImages();
  const cookie = first.gui.cookie;
  await h.key('CTRL+B');
  await h.until(s => s.canvases[0]?.texts.includes('Shared with KDESK'), 'KGUI32 publishes shared BMP');
  const exported = assertHddProtected(fixture, await h.disk('hdd'));
  assert.equal(fnv(rgb565(exported.files.get(path), 24, 64, 48)), image(first)[8]);
  await h.exit(vector);

  await h.type('KDESK\r');
  await screen('Ready');
  await h.key('CTRL+K');
  await screen('Find apps');
  await h.type('image viewer');
  await screen('1 results');
  await h.key('ENTER');
  await screen('BMP viewer');
  await h.key('CTRL+J');
  await screen('Pasted from KGUI32');
  await h.key('CTRL+B');
  await screen('Shared with KGUI32');

  const shared = assertHddProtected(fixture, await h.disk('hdd'));
  const expected = fnv(rgb565(shared.files.get(path), 8, 64, 48));
  await h.key('F10');
  await screen('KDESK exited.');
  await h.page().evaluate(cookie => {
    window.kgui32ExcludedCookie = cookie;
    delete window.kgui32Address;
  }, cookie);
  await h.type('KGUILDR.EXE\r');
  await h.until(s => s.gui.cookie !== cookie && s.gui.app?.frames && s.bridge.ready, 'New KGUI32 session on the same HDD');
  await openImages();
  await h.key('CTRL+J');
  await h.until(s => s.canvases[0]?.texts.includes('Pasted from KDESK') && image(s)?.[8] === expected, 'KGUI32 reads the exact KDESK palette pixels');
  await h.exit(vector, {discardImages: true});
  const after = assertHddProtected(fixture, await h.disk('hdd'));
  assert.deepEqual(after.files.get(path), shared.files.get(path));
  assert(!after.files.has('WORK/KGCLIP.TMP') && !after.files.has('WORK/KDIMG.BAK'));
  h.pass('KGUI32 and KDESK exchange real guest BMP data in both directions across desktop switches');
  await h.finish();
} catch (error) {
  await h.fail(error);
  throw error;
} finally {
  await h.close();
}
