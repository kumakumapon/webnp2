import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { inspectGUI } from './kgui32-inspect.mjs';

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

async function waitForDesktop(page, condition, label, timeout) {
  const deadline = Date.now() + timeout;
  let state;
  do {
    state = await inspectGUI(page, { pageTables: false });
    if (state?.ready === 1 && state.app?.frames > 1 && condition(state)) return state;
    await delay(250);
  } while (Date.now() < deadline);
  throw new Error(`${label}: ${JSON.stringify(state)}`);
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
    const desktop = await waitForDesktop(page, () => true, 'booting KGUI32', 120_000);
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
    // Calculator is a visible launcher control on both native desktop modes.
    await page.touchscreen.tap(
      box.x + (desktop.app.x0 + 88) * box.width / desktop.width,
      box.y + (desktop.app.y0 + 130) * box.height / desktop.height,
    );
    await waitForDesktop(page, state => state.app.active === 2, 'starting Calculator from a touchscreen tap', 30_000);
    await page.screenshot({ path: join(output, `${orientation}-calculator.png`) });
    assert.deepEqual(errors, []);
    console.log(`PASS ${video} ${slot}: ${orientation} phone boot and desktop Calculator tap`);
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
