import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { inspectGUI } from './kgui32-inspect.mjs';
import { inspectClients } from './kgui32-client-inspect.mjs';

const [base = 'http://127.0.0.1:4173/webnp2/', output = 'test-results/kgui32-start', video = 'pegc'] =
  process.argv.slice(2);
const manifest = JSON.parse(await readFile(new URL('../public/kgui32/manifest.json', import.meta.url)));
assert.ok(manifest.standalone_hdd?.hdd_boot_supported);
assert.ok(['pegc', 'cirrus'].includes(video));
const cirrus = video === 'cirrus';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
  args: process.env.WEBNP2_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
});

async function waitForState(inspect, condition, label, timeout) {
  const deadline = Date.now() + timeout;
  let state;
  do {
    state = await inspect();
    if (state && condition(state)) return state;
    await delay(250);
  } while (Date.now() < deadline);
  throw new Error(`${label}: ${JSON.stringify(state)}`);
}

// The Calculator publishes a client frame before the guest compositor renders it.
async function renderedDigit(page, previous) {
  const handle = await page.waitForFunction(previous => {
    const crop = document.createElement('canvas');
    crop.width = 8;
    crop.height = 16;
    const context = crop.getContext('2d');
    context.drawImage(document.querySelector('#canvas'), 40, 123, 8, 16, 0, 0, 8, 16);
    const rgba = context.getImageData(0, 0, 8, 16).data;
    const light = rgba.some((value, i) => i % 4 !== 3 && value >= 240);
    const dark = rgba.some((value, i) => i % 4 !== 3 && value < 100);
    if (!light || !dark) return false;
    const frame = crop.toDataURL();
    return frame !== previous && frame;
  }, previous, { polling: 200, timeout: 15_000 });
  try {
    return await handle.jsonValue();
  } finally {
    await handle.dispose();
  }
}

async function verifyBoot({ slot, image, viewport, lang, orientation }) {
  const page = await browser.newPage({
    viewport, screen: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(new URL(`?lang=${lang}`, base).href);
    const choices = page.locator('.overlay-choices');
    const primary = choices.locator('.start-btn-kgui32');
    const legacy = choices.locator('.start-btn-msdos4');
    await primary.waitFor();
    assert.equal(await choices.locator(':scope > :first-child').getAttribute('href'), await primary.getAttribute('href'));
    assert.equal(await primary.textContent(), lang === 'ja' ? 'KGUI32 で起動' : 'Start KGUI32');
    assert.ok(await legacy.isVisible());
    assert.equal(await legacy.textContent(), lang === 'ja' ? 'KDESK（互換用）で起動' : 'Start KDESK (compatibility)');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.evaluate(orientation => matchMedia(`(orientation: ${orientation})`).matches, orientation));
    const profiles = choices.locator('.boot-profiles');
    assert.equal(await profiles.getAttribute('open'), null);
    let choice = primary;
    if (cirrus || slot === 'fd1') {
      await profiles.locator('summary').tap();
      choice = profiles.locator(slot === 'hdd'
        ? '.start-btn-kgui32-highcolor'
        : cirrus ? '.start-btn-kgui32-fd-highcolor' : '.start-btn-kgui32-fd');
    }
    const bounds = await choice.boundingBox();
    assert.ok(bounds?.width >= 44 && bounds?.height >= 44, JSON.stringify(bounds));
    await choice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `${orientation}-start.png`) });
    const url = new URL(await choice.getAttribute('href'), base);
    const params = new URLSearchParams({ [slot]: `./kgui32/${image}`, run: '1', mem: '16', lang });
    if (cirrus) params.set('video', 'cirrus');
    assert.deepEqual([...url.searchParams].sort(), [...params].sort());
    await Promise.all([page.waitForURL(url.href), choice.tap()]);
    await page.waitForFunction(() => window.np2debug?.np2?.isBooted(), null, { timeout: 60_000 });
    const desktop = await waitForState(() => inspectGUI(page, { pageTables: false }),
      state => state.ready === 1 && state.app?.frames > 1, 'booting KGUI32', 120_000);
    assert.deepEqual([desktop.width, desktop.height, desktop.bpp], cirrus ? [800, 600, 2] : [640, 400, 1]);
    assert.equal(desktop.error, 0);
    assert.equal(await primary.count(), 0);
    assert.deepEqual(await page.evaluate(() => window.np2debug.np2.getMountedImages().map(
      ({ slot, name }) => ({ slot, name }),
    )), [{ slot, name: image }]);

    const canvas = page.locator('#canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 100 && box.height > 100, JSON.stringify(box));
    const tap = (x, y) => page.touchscreen.tap(
      box.x + x * box.width / desktop.width,
      box.y + y * box.height / desktop.height,
    );
    // Tap the Welcome launcher and then the first digit of the native Calculator.
    await tap(desktop.app.x0 + 88, desktop.app.y0 + 130);
    const calculator = async () => {
      const state = await inspectClients(page);
      if (state?.gui.app?.active === 2 && state.apps[0]?.magic === 0x3243474b) return state.apps[0];
    };
    await waitForState(calculator, app => app.frames > 0, 'opening Calculator by touch', 30_000);
    const zero = await renderedDigit(page, null);
    await tap(70, 164);
    await waitForState(calculator, app => app.value === 7 && app.frames > 1, 'entering 7 by touch', 30_000);
    await renderedDigit(page, zero);
    await page.screenshot({ path: join(output, `${orientation}-calculator.png`) });
    assert.deepEqual(errors, []);
    console.log(`PASS ${video} ${slot}: ${orientation} phone boot and Calculator touch input`);
  } finally {
    await page.close();
  }
}

try {
  await mkdir(output, { recursive: true });
  await verifyBoot({
    slot: 'hdd', image: manifest.standalone_hdd.image,
    viewport: { width: 390, height: 844 }, lang: 'ja', orientation: 'portrait',
  });
  await verifyBoot({
    slot: 'fd1', image: manifest.image,
    viewport: { width: 844, height: 390 }, lang: 'en', orientation: 'landscape',
  });
} finally {
  await browser.close();
}
