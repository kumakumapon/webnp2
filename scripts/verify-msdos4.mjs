// Usage: CHROMIUM=/usr/bin/chromium node scripts/verify-msdos4.mjs BASE_URL [OUTPUT_DIR]
// Run against the production preview, including a GitHub Pages project subpath.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { verifyFiler } from './verify-filer.mjs';
import { verifyEditor } from './verify-editor.mjs';
import { verifyJapaneseInput } from './verify-japanese-input.mjs';

const manifest = JSON.parse(await readFile(new URL('../public/msdos4/manifest.json', import.meta.url)));
const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const output = process.argv[3];
assert.ok(base.endsWith('/'), 'BASE_URL must end with /');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: process.env.WEBNP2_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
const results = [];
try {
  if (output) await mkdir(output, { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const text = () => page.evaluate(() => window.np2debug.np2.getScreenText().text);
  const line = async needle => {
    await page.waitForFunction(
      needle => window.np2debug?.np2?.getScreenText().lines.some(s => s.trim() === needle),
      { timeout: 60000 }, needle,
    ).catch(async error => { console.error(await text()); throw error; });
  };
  const command = async value => {
    await page.evaluate(value => window.np2debug.np2.typeText(value + '\r'), value);
    await new Promise(resolve => setTimeout(resolve, 250));
  };
  const readGuest = async name => Buffer.from(await page.evaluate(
    async name => btoa(String.fromCharCode(...await window.np2debug.np2.diskReadFile('fd1', name))), name,
  ), 'base64');

  await page.setViewport({ width: 390, height: 844 });
  await page.goto(new URL('?lang=en', base).href, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.start-btn-msdos4');
  assert.equal(await page.$eval('.start-btn-msdos4', el => el.textContent), 'Start with MS-DOS 4.0 + RetroBasic');
  assert.equal(new URL(await page.$eval('.start-btn-msdos4', el => el.href)).searchParams.get('lang'), 'en');
  assert.ok(await page.$('.start-btn-msdos2'), 'MS-DOS 2.0 must remain available');
  assert.ok(await page.$('.start-btn-freedos'), 'FreeDOS must remain available');
  await page.goto(new URL('?lang=ja', base).href, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.start-btn-msdos4');
  assert.equal(await page.$eval('.start-btn-msdos4', el => el.textContent), 'MS-DOS 4.0 + RetroBasic で起動');
  const boot = new URL(await page.$eval('.start-btn-msdos4', el => el.href));
  assert.equal(boot.searchParams.get('fd1'), `./msdos4/${manifest.image}`);
  assert.equal(boot.searchParams.get('run'), '1');
  assert.equal(boot.searchParams.get('lang'), 'ja');
  assert.equal(boot.pathname, new URL(base).pathname);
  await page.$eval('.start-btn-msdos4', el => el.scrollIntoView({ block: 'nearest' }));
  const reachable = await page.$eval('.start-btn-msdos4', el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
      && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  assert.ok(reachable, 'Mobile boot link must be visible and clickable inside the overlay');
  if (output) await page.screenshot({ path: join(output, 'mobile-start.png') });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('.start-btn-msdos4')]);
  await line('A>');
  assert.equal(await page.$('.start-btn-msdos4'), null, 'Explicit disk URLs must not offer another boot choice');
  assert.ok(!(await text()).includes('Specified COMMAND search directory bad'));
  results.push('Japanese/English mobile boot links, project subpath, existing OS choices, explicit disk URL');

  await command('VER');
  await line('MS-DOS Version 4.00');
  await command('P98TEST > EXEC.TXT');
  await command('TYPE EXEC.TXT');
  await line('DOS4 EXEC OK');
  assert.equal((await readGuest('EXEC.TXT')).toString(), 'DOS4 EXEC OK\r\n');
  results.push('Source-built DOS 4.00 boot, version API, COM EXEC, redirected output and return');

  await command('RBASIC');
  await line('Ready');
  const program = ['10 FOR I=1 TO 3', '20 PRINT I', '30 NEXT I', '40 PRINT "BUNDLED BASIC OK"'];
  for (const value of [...program, 'RUN']) await command(value);
  await line('BUNDLED BASIC OK');
  await command('SAVE "PROOF.BAS"');
  await command('NEW');
  await command('LOAD "PROOF.BAS"');
  await command('CLS 1');
  await command('RUN');
  await line('BUNDLED BASIC OK');
  await command('SYSTEM');
  await command('ECHO BASIC-RETURN-OK');
  await line('BASIC-RETURN-OK');
  const programBytes = Buffer.from(program.join('\r\n') + '\r\n');
  assert.deepEqual(await readGuest('PROOF.BAS'), programBytes);
  results.push('Native RetroBasic REPL, FOR/NEXT, RUN, SAVE/NEW/LOAD, SYSTEM and guest file readback');

  await command('RBASIC PRIMES.BAS');
  await line('Total primes found:  46');
  await command('RBASIC GRAPHICS.BAS');
  await line('Graphic demo rendered successfully.');
  const planes = await page.evaluate(() => [0xa8000, 0xb0000, 0xb8000]
    .map(addr => window.np2debug.np2.readMemoryBase64(addr, 32000).base64));
  const point = (x, y) => planes.reduce((color, b64, i) => color |
    ((Buffer.from(b64, 'base64')[y * 80 + (x >> 3)] & (0x80 >> (x & 7))) ? 1 << i : 0), 0);
  assert.equal(point(70, 60), 1, 'Blue rectangle in actual PC-98 VRAM');
  assert.equal(point(535, 220), 4, 'Green flood fill in actual PC-98 VRAM');
  if (output) await page.screenshot({ path: join(output, 'graphics.png') });
  await command('RBASIC FILEIO.BAS');
  await line('NATIVE FILE IO OK');
  const sequentialBytes = Buffer.from('"A,B",42,"Q""R"\r\nTAIL\r\nAPPEND\r\n');
  assert.deepEqual(await readGuest('SEQ.TXT'), sequentialBytes);
  results.push('Native prime/graphics samples with VRAM checks; numbered sequential file I/O and exact CSV/CRLF bytes');
  results.push(...await verifyFiler(page, {
    screenshot: output ? join(output, 'filer.png') : undefined, basic: true,
  }));
  results.push(...await verifyEditor(page, { screenshot: output ? join(output, 'editor.png') : undefined }));
  // Input settings and error feedback are checked in English as well.
  await page.evaluate(() => window.np2debug.np2.persistNow({ force: true }));
  await page.goto(new URL(`?fd1=./msdos4/${manifest.image}&run=1&lang=en&clk=8`, base).href, { waitUntil: 'networkidle2' });
  await line('A>');
  results.push(...await verifyJapaneseInput(page, { screenshot: output ? join(output, 'ime.png') : undefined }));

  await page.evaluate(() => window.np2debug.np2.persistNow({ force: true }));
  await page.reload({ waitUntil: 'networkidle2' });
  await line('A>');
  assert.deepEqual(await readGuest('PROOF.BAS'), programBytes);
  assert.deepEqual(await readGuest('SEQ.TXT'), sequentialBytes);
  await command('RBASIC PROOF.BAS');
  await line('BUNDLED BASIC OK');
  results.push('Guest-written BASIC/data files persist after reload and saved BASIC executes');

  const license = await page.evaluate(async () => {
    const response = await fetch('./msdos4/LICENSE.txt');
    if (!response.ok) throw new Error(`License HTTP ${response.status}`);
    return response.text();
  });
  assert.equal((await readGuest('LICENSE.TXT')).toString(), license);
  assert.ok(license.includes((await readGuest('DOSLIC.TXT')).toString()));
  const pristine = await page.evaluate(async image => {
    const response = await fetch(`./msdos4/${image}`);
    if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, manifest.image);
  assert.equal(createHash('sha256').update(Buffer.from(pristine)).digest('hex'), manifest.sha256);
  results.push('Distributed image stays pristine; all MIT notices are served and match guest notices');
  const exported = await page.evaluate(() => window.np2debug.np2.exportDiskBase64('fd1'));
  const disk = Buffer.from(exported.base64, 'base64');
  assert.deepEqual(disk.subarray(1024, 3072), disk.subarray(3072, 5120), 'Exported FAT copies must match');
  assert.deepEqual(errors, []);
  if (output) {
    await writeFile(join(output, 'guest-written.xdf'), disk);
    await page.screenshot({ path: join(output, 'screen.png') });
    await writeFile(join(output, 'verification.json'), JSON.stringify({
      browser: await browser.version(), base_url: base,
      webnp2_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      image_sha256: manifest.sha256, sources: manifest.sources, results, screen: await text(),
    }, null, 2) + '\n');
  }
  console.log('PASS:', results.join('\n'));
} finally {
  await browser.close();
}
