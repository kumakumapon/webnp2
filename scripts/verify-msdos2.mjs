// Run against a production preview, including a GitHub Pages project subpath.
// Usage: CHROMIUM=/usr/bin/chromium node scripts/verify-msdos2.mjs BASE_URL [SCREENSHOT]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const manifest = JSON.parse(await readFile(new URL('../public/msdos2/manifest.json', import.meta.url)));
const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
assert.ok(base.endsWith('/'), 'BASE_URL must end with /');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
  headless: true,
  args: process.env.WEBNP2_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const line = async needle => page.waitForFunction(
    needle => window.np2debug?.np2?.getScreenText().lines.some(s => s.trim() === needle),
    { timeout: 60000 }, needle,
  );
  const command = async value => page.evaluate(
    value => window.np2debug.np2.typeText(value + '\r'), value,
  );
  const readGuest = async name => page.evaluate(
    async name => btoa(String.fromCharCode(...await window.np2debug.np2.diskReadFile('fd1', name))), name,
  );

  // Check that the entry point remains available on a phone and preserves language.
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(new URL('?lang=en', base).href, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.start-btn-msdos2');
  assert.equal(await page.$eval('.start-btn-msdos2', el => el.textContent), 'Start with MS-DOS 2.0');
  assert.equal(new URL(await page.$eval('.start-btn-msdos2', el => el.href)).searchParams.get('lang'), 'en');
  await page.goto(new URL('?lang=ja', base).href, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.start-btn-msdos2');
  assert.equal(await page.$eval('.start-btn-msdos2', el => el.textContent), 'MS-DOS 2.0 で起動');
  const href = await page.$eval('.start-btn-msdos2', el => el.href);
  const boot = new URL(href);
  assert.equal(boot.searchParams.get('fd1'), `./msdos2/${manifest.image}`);
  assert.equal(boot.searchParams.get('run'), '1');
  assert.equal(boot.searchParams.get('lang'), 'ja');
  assert.equal(boot.pathname, new URL(base).pathname);
  const bounds = await page.$eval('.start-btn-msdos2', el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  assert.ok(bounds.left >= 0 && bounds.right <= 390 && bounds.top >= 0 && bounds.bottom <= 844);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('.start-btn-msdos2')]);
  await line('A>');
  assert.equal(await page.$('.start-btn-msdos2'), null, 'Explicit disk URLs must not offer another boot choice');
  assert.ok((await page.evaluate(() => window.np2debug.np2.getScreenText().text)).includes('MS-DOS version 2.00'));
  await command('VER');
  await line('MS-DOS Version  2.00');
  await command('ECHO PAGES-DOS2-OK>PROBE.TXT');
  await command('TYPE PROBE.TXT');
  await line('PAGES-DOS2-OK');
  await command('COPY PROBE.TXT COPIED.TXT');
  await line('1 File(s) copied');
  assert.equal(Buffer.from(await readGuest('PROBE.TXT'), 'base64').toString().trim(), 'PAGES-DOS2-OK');
  assert.equal(await readGuest('PROBE.TXT'), await readGuest('COPIED.TXT'));
  await page.evaluate(() => window.np2debug.np2.persistNow({ force: true }));
  await page.reload({ waitUntil: 'networkidle2' });
  await line('A>');
  await command('TYPE PROBE.TXT');
  await line('PAGES-DOS2-OK');
  assert.equal(Buffer.from(await readGuest('PROBE.TXT'), 'base64').toString().trim(), 'PAGES-DOS2-OK');
  const license = await page.evaluate(async () => {
    const response = await fetch('./msdos2/LICENSE.txt');
    if (!response.ok) throw new Error(`License HTTP ${response.status}`);
    return response.text();
  });
  assert.equal(Buffer.from(await readGuest('DOSLIC.TXT'), 'base64').toString(), license);
  const disk = await page.evaluate(async image => {
    const response = await fetch(`./msdos2/${image}`);
    if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, manifest.image);
  assert.equal(createHash('sha256').update(Buffer.from(disk)).digest('hex'), manifest.sha256);
  assert.deepEqual(errors, []);
  if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
  console.log('PASS: mobile boot link, MS-DOS 2.00, VER, file write/read/copy, persistence after reload, image checksum and MIT license');
} finally {
  await browser.close();
}
