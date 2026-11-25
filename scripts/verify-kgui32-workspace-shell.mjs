// Protected KGUI32 clients on shipped media. Tests mutate only guest-owned Work.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toolsHarness, fnv} from './kgui32-tools-harness.mjs';
import {assertHddProtected, withHddFile, withHddFolder} from './kgui32-hdd-fat.mjs';
import {sampleGuiSurface} from './kgui32-live-surface.mjs';

const [base = 'http://127.0.0.1:4173/webnp2/', output = 'test-results/kgui32-workspace-shell', video = 'pegc'] =
  process.argv.slice(2);
const h = await toolsHarness(base, output, video, {touch: true, viewport: {width: 390, height: 844}});
const button = (code, id = 0) => h.control(id, code);
const text = (label, id = 0) => h.until(s => s.canvases[id]?.texts.some(value => value.includes(label)), label);
const owned = (program, id = 0) => h.until(s => s.resources.usage[id]?.program === program && s.bridge.tokens[id], program);
const gone = id => h.until(s => s.cpu.views[id].state === 0, 'window closed ' + id);
const document = value => h.until(s => s.editors[0]?.mode === 0 && s.editors[0].hash === fnv(value), 'Editor text: ' + value);
const image = (s, id) => s.cpu.diagnostics[id]?.pm32?.samples;

async function search(query) {
  await h.key('CTRL+K');
  await h.type(query);
}
async function launch(query, program, id = 0) {
  await search(query);
  await h.key('ENTER');
  return owned(program, id);
}
async function chooseRow(value) {
  const frame = await h.until(s => s.canvases[0]?.draws.some(d => d.y >= 44 && (d.text === value || d.text.startsWith(value + ' '))), value + ' row');
  const row = frame.canvases[0].draws.find(d => d.y >= 44 && (d.text === value || d.text.startsWith(value + ' ')));
  const o = h.origin(frame, 0);
  await h.click(o.x + 24, o.y + 70 + row.y + 8);
}
async function navigate(folder) {
  await chooseRow(folder);
  await button(701);
}
async function tap(x, y) {
  const {gui} = await h.inspect();
  const canvas = h.page().locator('#canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box);
  await h.page().touchscreen.tap(box.x + x * box.width / gui.width, box.y + y * box.height / gui.height);
}
async function caption(previous = null, x = 16, y = 39, width = 132, height = 16) {
  const result = await h.page().waitForFunction(({previous, x, y, width, height}) => {
    const crop = window.document.createElement('canvas');
    crop.width = width; crop.height = height;
    crop.getContext('2d').drawImage(window.document.querySelector('#canvas'), x, y, width, height, 0, 0, width, height);
    const now = crop.toDataURL();
    return now !== previous && now;
  }, {previous, x, y, width, height}, {timeout: 20_000});
  try { return await result.jsonValue(); }
  finally { await result.dispose(); }
}
async function kuma(x) {
  const start = await caption();
  await tap(45, 16);
  const menu = await caption(start);
  await tap(x, 75);
  await caption(menu);
}
async function waitForWindow(id, expectedWindow) {
  const s = await h.guiUntil(a => a.frames, 'desktop');
  const result = await h.page().waitForFunction(sampleGuiSurface,
    {address: s.address, cookie: s.cookie, capacity: 2, id, expectedWindow}, {timeout: 30000});
  try { return (await result.jsonValue()).window; }
  finally { await result.dispose(); }
}

const originalText = 'Seed document\n';
const nestedText = 'Saved in Docs';
const rebootText = 'Saved at restart';
const leftover = Buffer.from('A fragment from the interrupted folder copy\r\n');

async function restoreTmp(fixture) {
  await launch('files', 'KGFILES.EXE');
  await button(104);
  await button(106);
  await button(417);
  await text('TMP folders / may be incomplete');
  await chooseRow('STAGE.TMP');
  await button(407);
  await text('Preview STAGE.TMP');
  await text('CHUNK.TXT');
  await text('Read-only preview');
  const before = assertHddProtected(fixture, await h.disk('hdd'));
  assert.deepEqual(before.files.get('WORK/STAGE.TMP/CHUNK.TXT'), leftover);
  assert.equal(before.entries.has('WORK/SALVAGED'), false);
  await h.key('r');
  const modal = await text('Recover incomplete TMP folder');
  await h.input(0, 32, Math.floor((modal.canvases[0].height - 152)/2) + 42, 'SALVAGED', 0);
  await button(410);
  await text('TMP folder recovered');
  await button(400);
  await button(103);
  await gone(0);
  h.pass('Explicit recovery publishes the existing partial folder under a new name');
}
async function nestedFiles() {
  await launch('editor', 'KGEDIT.EXE');
  await h.key('CTRL+O');
  await text('Open / A:\\WORK');
  await navigate('DOCS');
  await text('A:\\WORK\\DOCS');
  await chooseRow('READ.TXT');
  await button(701);
  await document(originalText);
  await h.setText(0, nestedText);
  await h.key('CTRL+W');
  await text('Save As / A:\\WORK');
  await navigate('DOCS');
  const picker = await text('Save As / A:\\WORK\\DOCS');
  await h.input(0, 32, picker.canvases[0].height - 65, 'NESTED.TXT');
  await button(701);
  await h.until(s => s.editors[0]?.mode === 0 && s.editors[0].dirty === 0, 'Saved nested text');
  await h.key('CTRL+O');
  await text('Open / A:\\WORK');
  await button(703);
  await text('Open / A: root');
  await navigate('WORK');
  await text('Open / A:\\WORK');
  await navigate('DOCS');
  await text('Open / A:\\WORK\\DOCS');
  await button(704);
  await h.until(s => s.canvases[0]?.texts.includes('Open / A:\\WORK'), 'Parent in the read-only drive');
  await h.key('ESC');
  await h.chord('GRPH', 'F4', 180);
  await gone(0);
  await kuma(61);
  const pin = await caption(null, 246, 96, 64, 28);
  await h.key('CTRL+P');
  await caption(pin, 246, 96, 64, 28);
  await tap(92, 110);
  await owned('KGEDIT.EXE');
  await document(nestedText);
  h.pass('Browse drives and folders, save a nested TXT and reopen it from Recent');
}
async function fontAndReboot() {
  await launch('settings', 'KGSET.EXE', 1);
  await h.until(s => s.gui.app.active === 3, 'Settings has keyboard focus');
  await h.key('p');
  await h.until(s => s.canvases[1]?.controls.includes(528), 'Preferences opened with the keyboard');
  await h.chord('SHIFT', 'TAB');
  await h.key('ENTER');
  await h.until(s => s.canvases[1]?.buttons.some(b => b.id === 528 && b.text === 'Text: Large'), 'Large text selected');
  await h.chord('SHIFT', 'TAB');
  await h.chord('SHIFT', 'TAB');
  await h.key('ENTER');
  await h.until(s => s.canvases[0]?.largeText?.includes(nestedText), '16 x 32 document text');
  await h.key('ESC');
  await h.key('ESC');
  await gone(1);
  const {gui} = await h.inspect();
  if (gui.app.active !== 2) {
    await tap(330, gui.height - 16);
    await h.until(s => s.gui.app.active === 2, 'Editor has keyboard focus');
  }
  await h.setText(0, rebootText);
  const before = (await h.inspect()).gui.cookie;
  await kuma(160);
  await tap(92, 110);
  await h.until(s => s.editors[0]?.mode === 2, 'Restart waits for dirty Editor');
  await h.key('ESC');
  await h.until(s => s.gui.cookie === before && s.editors[0]?.dirty && s.editors[0]?.mode === 0, 'Cancel keeps the running document');
  await kuma(160);
  await tap(92, 110);
  await h.until(s => s.editors[0]?.mode === 2, 'Restart requests save again');
  await h.key('s');
  await h.page().evaluate(cookie => {
    window.kgui32ExcludedCookie = cookie;
    delete window.kgui32Address;
  }, before);
  await h.until(s => s.gui.cookie !== before && s.gui.app?.frames && s.bridge.ready && !s.cpu.views[0].state, 'Warm reboot starts a new KGUI32 session');
  await h.key('CTRL+K');
  await h.key('ENTER');
  await owned('KGCLOCK.EXE');
  await h.until(s => s.canvases[0]?.largeText.some(value => /^\d\d:\d\d:\d\d$/.test(value)), 'Clock uses large digits after restart');
  await h.chord('GRPH', 'F4', 180);
  await gone(0);
  const closed = await caption();
  await h.chord('SHIFT', 'CTRL+K', 180);
  const menu = await caption(closed);
  await h.key('r');
  await caption(menu);
  await h.key('ENTER');
  await owned('KGEDIT.EXE');
  await document(rebootText);
  await h.key('CTRL+O');
  await h.until(s => s.canvases[0]?.largeText.includes('DOCS'), 'Shared picker lists folders with large glyphs');
  await h.key('CTRL+F');
  await h.type('DOCS');
  await h.key('DOWN');
  await h.key('ENTER');
  await text('Open / A:\\WORK\\DOCS');
  await h.until(s => s.canvases[0]?.largeText.includes('NESTED.TXT'), 'Keyboard opens folder in large picker');
  await h.key('ESC');
  await h.chord('GRPH', 'F4', 180);
  await gone(0);
  h.pass('Large text applies live and restart honours Cancel and Save, then reloads the pinned app');
  return h.page().evaluate(() => window.np2debug.np2.readMemoryBase64(0x24*4,4).base64);
}
async function clipboardAndPins() {
  await launch('images', 'KGIMAGE.EXE');
  const before = await h.until(s => image(s, 0)?.[8] && image(s, 0)[8] === image(s, 0)[9], 'Original image');
  const baseline = image(before, 0)[8];
  await h.key('i');
  const changed = await h.until(s => image(s, 0)?.[8] && image(s, 0)[8] !== baseline, 'Invert source image');
  await h.key('CTRL+C');
  await text('Image copied');
  await launch('images', 'KGIMAGE.EXE', 1);
  await h.key('CTRL+V');
  await h.until(s => image(s, 1)?.[8] === image(changed, 0)[8], 'Pasted pixels equal source');
  await h.key('u');
  await h.until(s => image(s, 1)?.[8] === baseline, 'Undo restores receiver');
  await h.end(1);
  await h.end(0);
  await search('clock');
  await h.key('CTRL+P');
  await h.key('ESC');
  await h.key('CTRL+K');
  await h.key('ENTER');
  await owned('KGCLOCK.EXE');
  const clock = await text('PC-98 / DOS wall clock');
  const {width, height} = clock.canvases[0];
  const rect = await waitForWindow(0, {w: width + 16, h: height + 104});
  await h.chord('GRPH', 'LEFT');
  await waitForWindow(0, {x: 8});
  await h.chord('GRPH', 'DOWN');
  await waitForWindow(0, rect);
  await h.chord('GRPH', 'F4', 180);
  await gone(0);
  h.pass('Images share exact RGB565 pixels and Undo; pin and Alt window commands work with guest keys');
}

async function lamp(x, active) {
  const handle = await h.page().waitForFunction(({x, active}) => {
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = 1;
    const pixels = scratch.getContext('2d');
    pixels.drawImage(document.querySelector('#canvas'), x, 14, 1, 1, 0, 0, 1, 1);
    return (pixels.getImageData(0, 0, 1, 1).data[0] >= 150) === active;
  }, {x, active}, {polling: 50, timeout: 15000});
  await handle.dispose();
}

async function pairedDialog() {
  const vector = await h.boot();
  await launch('editor', 'KGEDIT.EXE');
  await h.key('CTRL+O');
  await text('Open / B:\\WORK');
  await lamp(218, false);
  await Promise.all([lamp(218, true), button(703)]);
  await text('Open / A: root');
  await lamp(244, false);
  await Promise.all([lamp(244, true), button(703)]);
  await text('Open / B: root');
  await navigate('APPS');
  await text('Open / B:\\APPS');
  await h.key('ESC');
  await h.end(0);
  await h.unchangedFd();
  await h.exit(vector);
  h.pass('The shared picker browses A: and verified B: and lights each disk activity indicator');
}

try {
  const initial = await readFile(new URL('../public/kgui32/'+h.manifest.standalone_hdd.image, import.meta.url));
  let fixture = withHddFolder(withHddFolder(initial, 'DOCS'), 'STAGE.TMP');
  fixture = withHddFile(withHddFile(fixture, 'DOCS/READ.TXT', Buffer.from(originalText)), 'STAGE.TMP/CHUNK.TXT', leftover);
  await h.bootHdd(fixture);
  await restoreTmp(fixture);
  await clipboardAndPins();
  await nestedFiles();
  const vector = await fontAndReboot();
  const saved = assertHddProtected(fixture, await h.disk('hdd'));
  assert.deepEqual(saved.files.get('WORK/SALVAGED/CHUNK.TXT'), leftover);
  assert.equal(saved.entries.has('WORK/STAGE.TMP'), false);
  assert.equal(saved.files.get('WORK/DOCS/READ.TXT').toString(), originalText);
  assert.equal(saved.files.get('WORK/DOCS/NESTED.TXT').toString(), rebootText);
  assert.equal(saved.files.get('WORK/KGUIPREF.DAT').readUInt32LE(20), 1);
  assert.ok(saved.files.get('WORK/KGUIPINS.DAT').readUInt32LE(4));
  const history = saved.files.get('WORK/KGUIHIST.DAT');
  assert.equal(history.readUInt32LE(0), 1);
  assert.ok(history.readUInt32LE(4) > 1);
  const documents = Array.from({length: history.readUInt32LE(8)}, (_, i) => {
    const offset = 60 + i * 52;
    return {path: history.toString('ascii', offset + 12, offset + 52).split('\0')[0], pin: history.readUInt32LE(offset + 8)};
  });
  assert.deepEqual(documents.find(doc => doc.path === 'DOCS\\NESTED.TXT'), {path: 'DOCS\\NESTED.TXT', pin: 1});
  await h.unchangedFd();
  await h.exit(vector);
  await h.closeContext();
  await pairedDialog();
  await h.finish();
} catch (error) {
  await h.fail(error);
  throw error;
} finally {
  await h.close();
}
