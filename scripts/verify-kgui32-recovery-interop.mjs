import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toolsHarness, fnv} from './kgui32-tools-harness.mjs';
import {assertHddProtected, withHddFile, withHddFolder} from './kgui32-hdd-fat.mjs';

const [base = 'http://127.0.0.1:4173/webnp2/', output = 'test-results/kgui32-recovery-interop', video = 'pegc'] = process.argv.slice(2);
const h = await toolsHarness(base, output, video);
const text = value => h.until(s => s.canvases[0]?.texts.some(label => label.includes(value)), value);
const button = id => h.control(0, id);
const gone = () => h.until(s => !s.cpu.views[0].state, 'application closed');
const expectedText = 'Original document\n';
const oldPath = 'DOCS\\OLD.TXT', newPath = 'DEST\\GROUP\\NEW.TXT';
const stagedText = Buffer.from('Fragment in a nested folder\r\n');

async function launch(query, program) {
  await h.key('CTRL+K');
  await h.type(query);
  await h.key('ENTER');
  return h.until(s => s.resources.usage[0]?.program === program && s.bridge.tokens[0], program);
}
async function choose(name) {
  const row = s => s.canvases[0]?.draws.find(d => d.y >= 44 && (d.text === name || d.text.startsWith(name + ' ')));
  const shown = await h.until(s => row(s), name + ' row');
  const origin = h.origin(shown, 0);
  await h.click(origin.x + 24, origin.y + 70 + row(shown).y + 8);
}
async function manage() {
  await launch('files', 'KGFILES.EXE');
  await button(104);
  await button(106);
  await h.until(s => s.canvases[0]?.controls.includes(417), 'Work manager');
}
async function closeManager() {
  await button(400);
  await button(103);
  await gone();
}
async function operation(control, target, result) {
  await button(control);
  const modal = await h.until(s => s.canvases[0]?.controls.includes(410), 'Operation confirmation');
  await h.input(0, 32, Math.floor((modal.canvases[0].height - 152) / 2) + 42, target, 12);
  await button(410);
  await text(result);
}
function redBmp() {
  const width = 16, height = 16, size = 54 + width * height * 3;
  const bytes = Buffer.alloc(size);
  bytes.write('BM');
  for (const [at, value] of [[2, size], [10, 54], [14, 40], [18, width], [22, height], [34, size - 54]]) bytes.writeUInt32LE(value, at);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  for (let at = 56; at < size; at += 3) bytes[at] = 255;
  return bytes;
}
async function validatePreview(fixture, bitmap) {
  await manage();
  const before = await h.disk('hdd');
  await button(417);
  await text('TMP folders / may be incomplete');
  await choose('STAGE.TMP');
  await button(407);
  await text('Preview STAGE.TMP');
  await choose('SUB');
  await h.key('ENTER');
  await text('STAGE.TMP\\SUB');
  await choose('PART.TXT');
  await button(408);
  await text('Fragment in a nested folder');
  await text('Read-only preview');
  await h.key('ESC');
  await choose('PART.BMP');
  await button(408);
  const shown = await text('Read-only preview');
  const origin = h.origin(shown, 0);
  const pixel = await h.page().waitForFunction(({x, y}) => {
    const target = document.createElement('canvas');
    target.width = target.height = 1;
    const context = target.getContext('2d');
    context.drawImage(document.querySelector('#canvas'), x, y, 1, 1, 0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return red > 200 && green < 45 && blue < 45;
  }, {x: origin.x + 8 + Math.floor(shown.canvases[0].width / 2), y: origin.y + 70 + 48}, {timeout: 30000});
  await pixel.dispose();
  await h.key('ESC');
  await button(401);
  await text('Preview STAGE.TMP');
  assert((await h.disk('hdd')).equals(before), 'Browsing and previews leave every original disk byte intact');
  await operation(407, 'SALVAGE', 'TMP folder recovered');
  const recovered = assertHddProtected(fixture, await h.disk('hdd'));
  assert(!recovered.entries.has('WORK/STAGE.TMP'));
  assert.deepEqual(recovered.files.get('WORK/SALVAGE/SUB/PART.TXT'), stagedText);
  assert.deepEqual(recovered.files.get('WORK/SALVAGE/SUB/PART.BMP'), bitmap);
  await closeManager();
  h.pass('Nested TMP text and RGB565 bitmap preview is read-only, and explicit recovery preserves the original bytes');
}
async function recent() {
  const crop = () => h.page().evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 136;
    canvas.height = 16;
    canvas.getContext('2d').drawImage(document.querySelector('#canvas'), 16, 39, 136, 16, 0, 0, 136, 16);
    return canvas.toDataURL();
  });
  const waitCaption = async before => {
    for (let i = 0; i < 60; i++) {
      const now = await crop();
      if (now !== before) return now;
      await h.page().waitForTimeout(100);
    }
    assert.fail('Recent menu was not rendered');
  };
  const before = await crop();
  await h.chord('SHIFT', 'CTRL+K', 180);
  const menu = await waitCaption(before);
  await h.key('r');
  await waitCaption(menu);
}
function readHistory(fixture, disk) {
  const history = assertHddProtected(fixture, disk).files.get('WORK/KGUIHIST.DAT');
  if (!history) return new Map();
  assert.equal(history.readUInt32LE(0), 1);
  const documents = new Map();
  for (let i = 0; i < history.readUInt32LE(8); i++) {
    const offset = 60 + i * 52;
    documents.set(history.toString('ascii', offset + 12, offset + 52).split('\0')[0], history.readUInt32LE(offset + 8));
  }
  return documents;
}
async function historyUntil(fixture, predicate) {
  for (let i = 0; i < 12; i++) {
    const history = readHistory(fixture, await h.disk('hdd'));
    if (predicate(history)) return history;
    await h.page().waitForTimeout(250);
  }
  assert.fail('Expected recent history was not published to the HDD');
}
async function validateHistory(fixture) {
  await launch('editor', 'KGEDIT.EXE');
  await h.key('CTRL+O');
  await text('Open / A:\\WORK');
  await choose('DOCS');
  await button(701);
  await text('A:\\WORK\\DOCS');
  await choose('OLD.TXT');
  await button(701);
  const readDocument = () => h.until(s => s.editors[0]?.mode === 0 && s.editors[0]?.hash === fnv(expectedText), 'Original document text');
  await readDocument();
  await h.chord('GRPH', 'F4', 180);
  await gone();
  await recent();
  await h.click(274, 110);
  await historyUntil(fixture, history => history.get(oldPath) === 1);
  await h.key('ESC');

  await manage();
  await choose('DOCS');
  await button(408);
  await text('A:\\WORK\\DOCS');
  await choose('OLD.TXT');
  await operation(406, 'NEW.TXT', 'Renamed');
  await historyUntil(fixture, history => !history.has(oldPath) && history.get('DOCS\\NEW.TXT') === 1);
  await button(401);
  await choose('DOCS');
  await operation(405, 'DEST\\GROUP', 'Folder operation complete');
  await historyUntil(fixture, history => !history.has('DOCS\\NEW.TXT') && history.get(newPath) === 1);
  await closeManager();
  await recent();
  await h.key('ENTER');
  await readDocument();
  await h.chord('GRPH', 'F4', 180);
  await gone();
  await recent();
  await h.key('DEL');
  await historyUntil(fixture, history => !history.has(newPath));
  await h.key('ESC');
  const final = assertHddProtected(fixture, await h.disk('hdd'));
  assert.equal(final.files.get('WORK/DEST/GROUP/NEW.TXT').toString(), expectedText);
  h.pass('A pin follows a filename change and a cross-folder move, and removing the recent entry keeps its document');
}
async function validateLargeControls() {
  await launch('settings', 'KGSET.EXE');
  await button(522);
  await button(528);
  await button(526);
  await h.until(s => s.canvases[0]?.largeText.includes('Desktop preferences'), 'Large preferences heading');
  await button(527);
  await button(519);
  await gone();
  await launch('calculator', 'KGCALC.EXE');
  await h.until(s => s.canvases[0]?.largeText.includes('0'), 'Calculator result uses large glyphs');
  await h.key('TAB');
  await h.key('ENTER');
  await h.until(s => s.canvases[0]?.largeText.includes('8'), 'Tab and Enter operate the focused calculator key');
  await h.chord('SHIFT', 'TAB');
  await h.key('ENTER');
  await h.until(s => s.canvases[0]?.largeText.includes('87'), 'Shift+Tab reverses the keypad focus order');
  await h.key('q');
  await gone();
  await launch('calendar', 'KGCAL.EXE');
  const days = s => s.canvases[0]?.largeText.filter(line => !/^[0-9]{4}-[0-9]{2}$/.test(line));
  const before = days(await h.until(s => days(s)?.length && s.canvases[0]?.controls.includes(263), 'Calendar days use large glyphs'));
  await h.key('ROLLDOWN');
  await h.until(s => days(s)?.length && days(s).join() !== before.join(), 'Keyboard reveals the next weeks');
  await h.key('q');
  await gone();
  await launch('user dictionary', 'KGWORDS.EXE');
  await h.until(s => s.canvases[0]?.largeText.includes('User dictionary'), 'Large dictionary heading');
  await h.key('TAB');
  await h.type('word');
  await h.until(s => s.canvases[0]?.largeText.includes('word'), 'Tab reaches the large dictionary Word field');
  await h.key('CTRL+U');
  await h.chord('GRPH', 'F4', 180);
  await gone();
  h.pass('Calculator, Calendar and User dictionary expose large text and keyboard focus in the shared desktop setting');
}

try {
  const initial = await readFile(new URL('../public/kgui32/' + h.manifest.standalone_hdd.image, import.meta.url));
  let fixture = initial;
  for (const name of ['STAGE.TMP', 'STAGE.TMP/SUB', 'DOCS', 'DEST']) fixture = withHddFolder(fixture, name);
  const bitmap = redBmp();
  fixture = withHddFile(fixture, 'STAGE.TMP/SUB/PART.BMP', bitmap);
  fixture = withHddFile(fixture, 'STAGE.TMP/SUB/PART.TXT', stagedText);
  fixture = withHddFile(fixture, 'DOCS/OLD.TXT', Buffer.from(expectedText));
  const vector = await h.bootHdd(fixture);
  await validatePreview(fixture, bitmap);
  await validateHistory(fixture);
  await validateLargeControls();
  await h.exit(vector);
  await h.unchangedFd();
  await h.finish();
} catch (error) {
  await h.fail(error);
  throw error;
} finally {
  await h.close();
}
