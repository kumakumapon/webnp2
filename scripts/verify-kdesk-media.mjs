import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function verifyKdeskMedia(page, { output = 'test-results/kdesk-media' } = {}) {
  await mkdir(output, { recursive: true });
  const wait = needle => page.waitForFunction(needle => window.np2debug.np2.getScreenText().text.includes(needle), { timeout: 60000 }, needle);
  const key = value => page.evaluate(v => window.np2debug.np2.sendKeys(v), value);
  const type = value => page.evaluate(v => window.np2debug.np2.typeText(v), value);
  const open = async () => {
    await page.click('.toolbar-center > button:last-child');
    const rows = await page.$$('.library-menu:not(.hidden) [role="menuitem"]');
    let opened = false;
    for (const row of rows) if ((await row.evaluate(e => e.textContent)).includes('KDESK')) { await row.click(); opened = true; break; }
    assert.ok(opened, 'Media tools must be reachable from the visible toolbar menu');
    await page.waitForSelector('.kdesk-media');
  };
  const action = name => page.click(`.kdesk-media [data-action="${name}"]`);
  const close = () => page.click('.kdesk-media-close');
  const guest = async name => Buffer.from(await page.evaluate(async name => Array.from(await window.np2debug.np2.diskReadFile('fd1', name)), name));
  const note = 'WINDOW MEMO OK\r\nSECOND LINE';
  await type('KDESK\r'); await wait('Ready'); await key('F4'); await wait('NOTE.TXT');
  await key('CTRL+A'); await key('CTRL+C'); await wait('Copied memo');
  await page.evaluate(() => {
    window.savedClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async value => { window.testClipboardText = value; },
      readText: async () => 'HOST CLIPBOARD',
      read: async () => [new ClipboardItem({ 'image/png': await (await fetch(window.testClipboardInput)).blob() })],
      write: async items => { const blob = await items[0].getType('image/png'); window.testClipboardPng = Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)); },
    } });
  });
  await open(); await action('get-text');
  assert.equal(await page.$eval('.kdesk-media-text', el => el.value), note.replace(/\r\n/g,'\n'));
  await action('copy-text');
  await page.waitForFunction(() => window.testClipboardText === 'WINDOW MEMO OK\nSECOND LINE');
  await action('read-text'); await page.waitForFunction(() => document.querySelector('.kdesk-media-text').value === 'HOST CLIPBOARD');
  await page.focus('.kdesk-media-text'); await page.keyboard.press('F10');
  assert.ok((await page.evaluate(() => window.np2debug.np2.getScreenText().text)).includes('Kuma Desktop'), 'Panel keys must not leak into DOS');
  await page.$eval('.kdesk-media-text', el => { el.value = ' BRIDGE OK'; }); await action('paste-text'); await wait('BRIDGE OK');
  assert.equal((await guest('NOTE.TXT')).toString(),note,'Pasting does not save over the note automatically');
  await close(); await key('CTRL+A'); await type(note.replace(/\r\n/g,'\r')); await key('CTRL+S'); await wait('Saved NOTE.TXT');
  assert.equal((await guest('NOTE.TXT')).toString(),note);
  await open();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0,0,240,300); g.fillStyle = '#0000ff'; g.fillRect(240,0,240,300);
    return c.toDataURL('image/png').split(',')[1];
  });
  const input = resolve(output, 'host-input.png'); await writeFile(input, Buffer.from(png,'base64'));
  await (await page.$('.kdesk-media-file')).uploadFile(input);
  await action('import-image');
  await page.waitForFunction(() => document.querySelector('.kdesk-media-status').textContent.includes('IMPORT.BMP'), { timeout: 60000 });
  const bmp = await guest('IMPORT.BMP'); assert.equal(bmp.readInt32LE(18),320); assert.equal(bmp.readInt32LE(22),200); assert.equal(bmp.readUInt16LE(28),8);
  assert.equal(bmp[1078],196); assert.equal(bmp[1078+319],21);
  await page.evaluate(png=>{window.testClipboardInput='data:image/png;base64,'+png;},png);
  await page.$eval('.kdesk-media-filename',el=>{el.value='CLIP.BMP';});await action('import-host-image');
  await page.waitForFunction(()=>document.querySelector('.kdesk-media-status').textContent.includes('CLIP.BMP'),{timeout:60000});
  assert.deepEqual(await guest('CLIP.BMP'),bmp,'Host image clipboard uses the same DOS BMP conversion');
  await close(); await key('F10'); await wait('KDESK exited.');
  await type('KVIEW IMPORT.BMP\r'); await wait('Opened BMP'); await wait('256 colors');
  await open(); await action('get-image');
  assert.deepEqual(await page.$eval('.kdesk-media-preview', c => [c.width,c.height]),[320,200]);
  assert.deepEqual(await page.$eval('.kdesk-media-preview', c => Array.from(c.getContext('2d').getImageData(0,0,1,1).data)),[255,0,0,255]);
  await action('copy-image'); await page.waitForFunction(() => window.testClipboardPng?.length === 8);
  assert.deepEqual(await page.evaluate(() => window.testClipboardPng),[137,80,78,71,13,10,26,10]);
  await page.setViewport({width:390,height:844});
  const reachable = await page.$eval('.kdesk-media', p => {const r=p.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight;});
  assert.ok(reachable,'The media dialog must fit a mobile viewport and scroll internally');
  await page.screenshot({path:join(output,'media-panel.png')});
  await close(); await key('F10'); await wait('KVIEW exited.');
  await page.evaluate(() => { if (window.savedClipboard) Object.defineProperty(navigator,'clipboard',window.savedClipboard); else delete navigator.clipboard; });
  await page.setViewport({width:1000,height:780});
  return ['visible KDESK media controls; native/host text clipboard with no key leakage',
    'File and host clipboard PNG import resize to 320x200 and writes valid BMP opened by native KVIEW',
    'native image/selection export to PNG clipboard; responsive media dialog'];
}
