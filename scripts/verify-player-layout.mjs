import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

export async function verifyPlayerLayout(base, boot, screenshot) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
    args: process.env.WEBNP2_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
  });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
    await desktop.goto(new URL('?lang=en', base).href);
    const fd1 = desktop.locator('[data-drive="fd1"]');
    const fd2 = desktop.locator('[data-drive="fd2"]');
    const menu = desktop.locator('#drive-actions-menu');
    for (const slot of [fd1, fd2]) {
      await slot.waitFor();
      assert.equal(await slot.locator('.drive-control:visible').count(), 3);
      const lamp = slot.getByRole('img', { name: /idle/ });
      assert.equal(await lamp.evaluate(el => getComputedStyle(el).borderRadius), '50%');
    }
    await fd1.getByRole('button', { name: /Insert/ }).click();
    await menu.waitFor();
    assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), [
      'Choose a file', 'Insert from library', 'Insert FreeDOS(98)', 'Create blank FD (1.2MB, FAT12 formatted)',
    ]);
    await desktop.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false);
    assert.equal(await fd1.locator('.drive-insert').evaluate(el => el === document.activeElement), true);
    await fd2.locator('.drive-insert').click();
    await menu.waitFor();
    assert.equal(await menu.getByRole('menuitem', { name: /FreeDOS/ }).count(), 0);
    const chooser = desktop.waitForEvent('filechooser');
    await menu.getByRole('menuitem', { name: 'Choose a file' }).click();
    assert.ok(await chooser);
    assert.equal(await desktop.locator('html').getAttribute('data-theme'), 'dark');
    await desktop.getByRole('button', { name: 'More', exact: true }).click();
    await desktop.locator('.toolbar-overflow-menu').getByRole('menuitem', { name: /Display/ }).click();
    await desktop.getByRole('menuitem', { name: 'Theme: System' }).click();
    assert.equal(await desktop.locator('html').getAttribute('data-theme'), 'light');
    await desktop.reload();
    await desktop.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await desktop.close();

    const phone = await browser.newPage({
      isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3, reducedMotion: 'reduce',
    });
    await phone.goto(new URL('?lang=en', base).href);
    await phone.locator('.boot-file-picker').waitFor();
    assert.equal(await phone.locator('.start-btn-msdos2').getAttribute('aria-description'),
      'Original DOS command environment');
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (screenshot) await phone.screenshot({ path: join(dirname(screenshot), 'boot-portrait.png') });
    await phone.setViewportSize({ width: 844, height: 390 });
    await phone.goto(boot);
    await phone.locator('body.compact-landscape').waitFor({ timeout: 60_000 });
    const toggle = phone.getByRole('button', { name: 'Controls', exact: true });
    const footer = phone.locator('.console-footer');
    assert.equal(await footer.isVisible(), false);
    await phone.waitForFunction(() => {
      const rect = document.querySelector('#canvas').getBoundingClientRect();
      return rect.width > 100 && rect.height > 100 && rect.left >= 0 &&
        rect.right <= visualViewport.width + 1 && rect.bottom <= visualViewport.height + 1;
    });
    await toggle.tap();
    await footer.waitFor();
    const slot = footer.locator('[data-drive="fd1"]');
    for (const button of await slot.locator('.drive-control').all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds?.width >= 44 && bounds?.height >= 44, JSON.stringify(bounds));
    }
    const disk = slot.locator('.drive-name-button');
    await phone.waitForFunction(() => !document.querySelector('[data-drive="fd1"] .drive-name-button').disabled);
    await disk.tap();
    await phone.getByRole('menuitem', { name: 'Download' }).waitFor();
    await phone.keyboard.press('Escape');
    await footer.getByRole('button', { name: 'More', exact: true }).tap();
    await phone.locator('.toolbar-overflow-menu').getByRole('menuitem', { name: /Display/ }).tap();
    await phone.locator('.toolbar-overflow-menu').getByRole('menuitem', { name: 'Theme: System' }).waitFor();
    if (screenshot) await phone.screenshot({ path: join(dirname(screenshot), 'controls-landscape.png') });
    await phone.keyboard.press('Escape');
    await phone.getByRole('button', { name: 'Hide controls' }).tap();
    assert.equal(await footer.isVisible(), false);
    console.log('PASS: drive menus, file picker, persistent theme and touch controls in portrait and landscape');
  } finally {
    await browser.close();
  }
}
