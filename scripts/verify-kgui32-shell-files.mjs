// Run the shell, media operations and shared picker in the packaged PC-98 guest.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toolsHarness } from './kgui32-tools-harness.mjs';
import { assertHddProtected, inspectHdd, withHddFile } from './kgui32-hdd-fat.mjs';
import { sampleGuiSurface } from './kgui32-live-surface.mjs';

const [base = 'http://127.0.0.1:4173/webnp2/', output = 'test-results/kgui32-shell-files', video = 'pegc'] =
  process.argv.slice(2);
const h = await toolsHarness(base, output, video, { touch: true, viewport: { width: 390, height: 844 } });
const button = id => h.control(0, id);
const waitText = value => h.until(s => s.canvases[0]?.texts.some(text => text.includes(value)), value);
const owned = (name, id = 0) => h.until(s => s.cpu.views[id]?.state &&
  s.resources.usage[id]?.program === name && s.bridge.tokens[id], name);

async function tap(x, y) {
  const { gui } = await h.inspect();
  const canvas = h.page().locator('#canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box);
  await h.page().touchscreen.tap(box.x + x * box.width / gui.width, box.y + y * box.height / gui.height);
}
async function windowRect(id, expectedWindow) {
  const s = await h.guiUntil(app => app.frames, "Desktop window geometry");
  const handle = await h.page().waitForFunction(sampleGuiSurface, {
    address: s.address, cookie: s.cookie, capacity: 2, id, expectedWindow,
  }, { timeout: 15_000 });
  try { return (await handle.jsonValue()).window; }
  finally { await handle.dispose(); }
}
async function find(name) {
  await h.key('CTRL+K');
  await h.type(name);
  await h.key('ENTER');
}
async function choose(name) {
  const list = await h.until(s => s.canvases[0]?.controls.includes(412), 'File list');
  const o = await windowRect(0);
  const findRow = s => s.canvases[0]?.draws.find(draw =>
    draw.y >= 66 && draw.y < s.canvases[0].height - 93 && draw.text.startsWith(name + ' '));
  let row = findRow(list);
  if (!row) {
    const { width, draws } = list.canvases[0];
    const down = draws.find(draw => draw.text === 'v');
    assert.ok(down, `A scroll button is available for ${name}`);
    let first = draws.find(draw => draw.y === 66).text;
    for (let i = 0; !row && i < 8; i++) {
      await tap(o.x + 8 + width - 18, o.y + 70 + down.y + 8);
      const frame = await h.until(s => s.canvases[0]?.draws.some(draw =>
        draw.y === 66 && draw.text !== first), `List scrolled for ${name}`);
      row = findRow(frame);
      first = frame.canvases[0].draws.find(draw => draw.y === 66).text;
    }
  }
  assert.ok(row, name + ' row is reachable by scrolling');
  await h.click(o.x + 24, o.y + 70 + row.y + 8);
}
async function operation(id, value, result) {
  await button(id);
  const s = await h.until(s => s.canvases[0]?.controls.includes(410), 'File operation confirmation');
  if (value) await h.input(0, 32, Math.floor((s.canvases[0].height - 152) / 2) + 42, value, 12);
  await button(410);
  await waitText(result);
}

async function renderedCrop(x, y, width, height, previous = null) {
  const handle = await h.page().waitForFunction(({ x, y, width, height, previous }) => {
    const crop = document.createElement('canvas');
    crop.width = width;
    crop.height = height;
    crop.getContext('2d').drawImage(document.querySelector('#canvas'), x, y, width, height, 0, 0, width, height);
    const frame = crop.toDataURL();
    return frame !== previous && frame;
  }, { x, y, width, height, previous }, { polling: 120, timeout: 20_000 });
  try { return await handle.jsonValue(); }
  finally { await handle.dispose(); }
}

const menuCaption = previous => renderedCrop(16, 39, 128, 16, previous);

async function shell() {
  const desktop = await menuCaption();
  await tap(45, 16);
  await menuCaption(desktop);
  // Fourth row of the touchable Kuma menu opens the built-in search.
  const menu = await menuCaption();
  await tap(100, 212);
  await menuCaption(menu);
  await h.type('KGCALC');
  await h.key('ENTER');
  await owned('KGCALC.EXE');
  await find('clock');
  await owned('KGCLOCK.EXE', 1);
  await h.guiUntil(app => app.active === 3, 'Clock focused');
  await h.chord('GRPH', 'TAB');
  await h.guiUntil(app => app.active === 2, 'Alt+Tab release focused Calculator');
  await h.page().setViewportSize({ width: 844, height: 390 });
  const beforeSwitch = await menuCaption();
  await tap(45, 16);
  const switchMenu = await menuCaption(beforeSwitch);
  await tap(100, 246);
  await menuCaption(switchMenu);
  await tap(100, 144);
  await h.guiUntil(app => app.active === 3, 'Landscape touch selected Clock');
  await h.chord('GRPH', 'TAB');
  await h.guiUntil(app => app.active === 2, 'Calculator refocused');
  const position = await windowRect(0);
  await h.point(position.x + 160, position.y + 14);
  await h.button(1);
  await h.point(position.x + 204, position.y + 38);
  await h.button(0);
  const moved = await windowRect(0);
  assert.equal(moved.x, position.x + 44);
  const { gui } = await h.inspect();
  assert.equal(moved.y, Math.min(position.y + 24, gui.height - 40 - position.h));
  h.pass('Kuma menu and switcher taps in portrait and landscape, executable-name search, PC-98 GRPH+Tab and moving a window');
  return moved;
}

async function files() {
  await find('files');
  await owned('KGFILES.EXE');
  await button(106);
  await waitText('Drive root / read only');
  await choose('APPS');
  await button(408);
  await waitText('A:\\APPS');
  await button(416);
  await waitText('A:\\WORK');
  await operation(403, 'BOX', 'Folder created');
  await choose('SOURCE.BIN');
  await operation(404, 'BOX\\COPY.BIN', 'Copied');
  await operation(403, 'PARENT', 'Folder created');
  await choose('BOX');
  await operation(406, 'RENAMED', 'Renamed');
  await choose('RENAMED');
  await operation(404, 'COPYBOX', 'Folder operation complete');
  await choose('COPYBOX');
  await operation(405, 'PARENT\\MOVED', 'Folder operation complete');
  await choose('RENAMED');
  await operation(407, '', 'In Trash');
  await button(402);
  await choose('RENAMED');
  await operation(407, '', 'Restored');
  await button(402);
  await button(400);
  await button(103);
  await h.until(s => s.cpu.views[0].state === 0, 'Files closed');
  h.pass('Read-only drive view and Work directory rename, copy, cross-parent move, trash and restore');
}

async function imagePicker() {
  await find('images');
  await owned('KGIMAGE.EXE');
  await h.key('CTRL+O');
  await h.until(s => s.canvases[0]?.controls.includes(701), 'Bitmap picker');
  await h.key('CTRL+W');
  await waitText('Open / A: root');
  await h.type('SAMPLE');
  await h.key('TAB');
  await h.key('ENTER');
  await h.until(s => !s.canvases[0]?.controls.includes(701) && s.canvases[0]?.controls.includes(19), 'Bitmap opened');
  await h.key('CTRL+SHIFT+S');
  let s = await h.until(s => s.canvases[0]?.controls.includes(701), 'Shared BMP Save As');
  await h.input(0, 32, s.canvases[0].height - 65, 'PICKED.BMP', 12);
  await button(701);
  await waitText('Saved to Work');
  await h.key('Q');
  await h.until(s => s.cpu.views[0].state === 0, 'Images closed');
  h.pass('Images uses the shared open/save picker and publishes a new BMP in Work');
}

async function preferences() {
  await find('settings');
  await owned('KGSET.EXE');
  await button(522);
  await button(524);
  await button(525);
  await button(525);
  await button(523);
  const { gui } = await h.inspect();
  const x = gui.width - 32, y = gui.height - 36;
  const classic = await renderedCrop(x, y, 12, 3);
  await button(526);
  await renderedCrop(x, y, 12, 3, classic);
  await h.until(s => s.canvases[0]?.buttons.some(control =>
    control.id === 523 && Array.from(control.text).some(ch => ch.charCodeAt(0) > 127)), 'Japanese applied live');
  await button(527);
  await button(519);
  await h.until(s => s.cpu.views[0].state === 0, 'Settings closed');
}

async function pairedDrives() {
  const vector = await h.boot(h.hdd);
  await find('files');
  await owned('KGFILES.EXE');
  await button(106);
  await waitText('Drive root / read only');
  await button(416);
  await h.until(s => s.canvases[0]?.texts.includes('B:\\'), 'Verified paired HDD selected as B:');
  await button(416);
  await waitText('B:\\WORK');
  await button(400);
  await button(103);
  await h.until(s => s.cpu.views[0].state === 0, 'Files closed on paired media');
  await h.unchangedFd();
  await h.exit(vector);
  h.pass('FD plus HDD boot switches the read-only drive view from A: to B: and then returns to B:\\WORK');
}

try {
  const disk = await readFile(new URL('../public/kgui32/' + h.manifest.standalone_hdd.image, import.meta.url));
  const content = Buffer.from(Array.from({ length: 9001 }, (_, i) => (i * 17 + 3) & 255));
  const fixture = withHddFile(disk, 'SOURCE.BIN', content);
  let vector = await h.bootHdd(fixture);
  const moved = await shell();
  await h.exit(vector);
  let saved = await h.disk('hdd');
  assert.ok(inspectHdd(saved).files.has('WORK/KGUILAY.DAT'));
  await h.closeContext();

  vector = await h.bootHdd(saved);
  await find('calc');
  await owned('KGCALC.EXE');
  assert.deepEqual(await windowRect(0, moved), moved);
  await h.click(moved.x + 232, moved.y + 48);
  await h.until(s => s.cpu.views[0].state === 0, 'Calculator ended');
  await files();
  await imagePicker();
  await preferences();
  await h.exit(vector);
  saved = await h.disk('hdd');
  const fat = assertHddProtected(fixture, saved);
  assert.deepEqual(fat.files.get('WORK/SOURCE.BIN'), content);
  assert.deepEqual(fat.files.get('WORK/RENAMED/COPY.BIN'), content);
  assert.deepEqual(fat.files.get('WORK/PARENT/MOVED/COPY.BIN'), content);
  assert.equal(fat.entries.get('WORK/COPYBOX').attr & 6, 6);
  assert.equal(fat.files.get('WORK/PICKED.BMP').subarray(0, 2).toString(), 'BM');
  const pref = fat.files.get('WORK/KGUIPREF.DAT');
  assert.deepEqual([pref.readUInt32LE(8), pref.readUInt32LE(12), pref.readUInt32LE(16)], [1, 1, 2]);
  assert.ok(![...fat.entries.keys()].some(name => name.endsWith('.TMP')));
  await h.closeContext();

  vector = await h.bootHdd(saved);
  await find('editor');
  await h.until(s => s.editors[0]?.frames && s.imes[0]?.scheme === 2, 'Persisted JIS kana default');
  await h.end(0);
  await h.exit(vector);
  h.pass('Cold HDD boot restores Calculator layout and the saved Japanese input preference');
  await h.closeContext();
  await pairedDrives();
  await h.finish();
} catch (error) {
  await h.fail(error);
  throw error;
} finally {
  await h.close();
}
