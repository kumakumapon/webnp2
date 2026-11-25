import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toolsHarness, fnv} from './kgui32-tools-harness.mjs';
import {assertHddProtected, withHddFile} from './kgui32-hdd-fat.mjs';

const [base = 'http://127.0.0.1:4173/webnp2/', output = 'test-results/kgui32-kdesk-clipboard', video = 'pegc'] =
  process.argv.slice(2);
const h = await toolsHarness(base, output, video);
const image = state => state.cpu.diagnostics[0]?.pm32?.samples;
const path = 'WORK/KGCLIP.BMP';
const textPath = 'WORK/KGTEXT.TXT';
const width = 256, height = 192;
const sourceText = Buffer.concat([Buffer.from([0x93, 0xfa, 0x96, 0x7b]), Buffer.from('\r\nLine two')]);
const lf = bytes => Buffer.from(bytes.filter(byte => byte !== 13));

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
async function openEditor() {
  await h.key('CTRL+K');
  await h.type('editor');
  await h.key('ENTER');
  return h.until(s => s.editors[0]?.frames && s.imes[0] && s.canvases[0]?.controls.includes(602), 'Editor guest canvas and IME');
}

function sourceBitmap() {
  const stride = width * 3;
  const bytes = Buffer.alloc(54 + stride * height);
  bytes.write('BM');
  for (const [at, value] of [[2, bytes.length], [10, 54], [14, 40], [18, width], [22, height], [34, stride * height]]) {
    bytes.writeUInt32LE(value, at);
  }
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = 54 + y * stride + x * 3;
    bytes[at] = (x * 13 + y * 7) & 255;
    bytes[at + 1] = (x * 3 + y * 15) & 255;
    bytes[at + 2] = (x * 19 + y) & 255;
  }
  return bytes;
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
  const initial = await readFile(new URL('../public/kgui32/' + h.manifest.standalone_hdd.image, import.meta.url));
  const bitmap = sourceBitmap();
  const pixels = rgb565(bitmap, 24, width, height);
  const expected = fnv(pixels);
  const fixture = withHddFile(withHddFile(initial, 'SHARE.BMP', bitmap), 'JPN.TXT', sourceText);
  const vector = await h.bootHdd(fixture);
  const first = await openImages();
  const cookie = first.gui.cookie;
  await h.key('CTRL+O');
  await h.until(s => s.canvases[0]?.controls.includes(701), 'Open shared BMP fixture');
  await h.type('SHARE');
  await h.key('TAB');
  await h.key('ENTER');
  await h.until(s => image(s)?.[8] === expected, '256 x 192 source is decoded to exact RGB565');
  await h.key('CTRL+B');
  await h.until(s => s.canvases[0]?.texts.includes('Shared with KDESK'), 'KGUI32 publishes shared BMP');
  const exported = assertHddProtected(fixture, await h.disk('hdd'));
  assert.deepEqual(rgb565(exported.files.get(path), 24, width, height), pixels);
  await h.key('q');
  await h.until(s => !s.cpu.views[0].state, 'Images closed');
  await openEditor();
  await h.open(0, 'JPN.TXT');
  await h.until(s => s.editors[0]?.hash === fnv(lf(sourceText)), 'Shift-JIS source document');
  await h.chord('SHIFT', 'CTRL+B', 180);
  await h.until(s => s.canvases[0]?.texts.includes('Shared text with KDESK'), 'KGUI32 publishes text');
  assert.deepEqual(assertHddProtected(fixture, await h.disk('hdd')).files.get(textPath), lf(sourceText));
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
  assert.deepEqual(rgb565(shared.files.get(path), 24, width, height), pixels);
  await h.key('CTRL+J');
  await screen('Pasted from KGUI32');
  await h.key('CTRL+K');
  await screen('Find apps');
  await h.type('text editor');
  await screen('1 results');
  await h.key('ENTER');
  await screen('[New file]');
  await h.key('CTRL+J');
  await screen('Pasted text from KGUI32');
  await h.type('!\r');
  await h.key('CTRL+B');
  await screen('Shared text with KGUI32');
  const returned = Buffer.concat([sourceText, Buffer.from('!\r\n')]);
  assert.deepEqual(assertHddProtected(fixture, await h.disk('hdd')).files.get(textPath), returned);
  await h.key('CTRL+R');
  await screen('Discard edits?');
  await h.key('ENTER');
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
  await h.until(s => s.canvases[0]?.texts.includes('Pasted from KDESK') && image(s)?.[8] === expected, 'KGUI32 reads every RGB565 pixel back from KDESK');
  await h.end(0);
  await openEditor();
  const beforePaste = await h.inspect();
  await h.chord('SHIFT', 'CTRL+J', 180);
  const pasted = await h.until(s => s.editors[0]?.hash === fnv(lf(returned)) && s.editors[0]?.bytes === lf(returned).length, 'KGUI32 pastes returned Shift-JIS text with normalized line breaks');
  assert.equal(pasted.imes[0].scheme, beforePaste.imes[0].scheme);
  await h.key('CTRL+J');
  await h.until(s => s.imes[0] && s.imes[0].scheme !== pasted.imes[0].scheme && s.editors[0]?.hash === pasted.editors[0].hash, 'Unshifted Ctrl+J still cycles the IME');
  await h.chord('GRPH', 'F4', 180);
  await h.until(s => s.canvases[0]?.controls.includes(801), 'Editor asks before closing unsaved text');
  await h.key('d');
  await h.until(s => !s.cpu.views[0].state, 'Discard closes only the unsaved Editor');
  await h.exit(vector);
  const after = assertHddProtected(fixture, await h.disk('hdd'));
  assert.deepEqual(after.files.get(path), shared.files.get(path));
  assert.deepEqual(after.files.get('WORK/JPN.TXT'), sourceText);
  assert.deepEqual(after.files.get(textPath), returned);
  assert(!after.files.has('WORK/KGCLIP.TMP') && !after.files.has('WORK/KDIMG.BAK'));
  h.pass('KGUI32 and KDESK exchange 256 x 192 RGB565 pixels and Shift-JIS text across desktop switches');
  await h.finish();
} catch (error) {
  await h.fail(error);
  throw error;
} finally {
  await h.close();
}
