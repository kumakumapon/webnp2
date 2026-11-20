import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function openToolbarDialog(page, group, action) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.locator('.toolbar-overflow-menu').getByRole('menuitem', { name: new RegExp(`^${group}`) }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

async function interactWithDialog(page, action, respond) {
  await Promise.all([page.waitForEvent('dialog').then(respond), action()]);
}

export async function verifyFileManager(page) {
  await openToolbarDialog(page, 'Disk', 'File Transfer');
  const modal = page.locator('.fm-modal');
  await modal.getByRole('button', { name: 'Create Transfer FD', exact: true }).click();
  await modal.locator('.fm-disk-table').waitFor();
  const makeFolder = async name => {
    await interactWithDialog(page, () => modal.getByRole('button', { name: 'New Folder', exact: true }).click(), async dialog => {
      assert.equal(dialog.type(), 'prompt');
      await dialog.accept(name);
    });
    await modal.getByRole('button', { name, exact: true }).waitFor();
  };
  const path = modal.getByRole('navigation', { name: 'Current folder' });
  await makeFolder('WORK');
  await modal.getByRole('button', { name: 'WORK', exact: true }).press('Enter');
  await makeFolder('DEEP');
  await modal.getByRole('button', { name: 'DEEP', exact: true }).click();
  await path.getByRole('button', { name: 'WORK', exact: true }).click();
  await path.getByRole('button', { name: '/ (root)', exact: true }).click();
  await modal.getByRole('button', { name: 'WORK', exact: true }).click();

  const large = Buffer.from('Longer checked file transfer');
  const small = Buffer.from('x');
  await modal.locator('input[type="file"]').setInputFiles([
    { name: 'along.txt', mimeType: 'text/plain', buffer: large },
    { name: 'ztiny.txt', mimeType: 'text/plain', buffer: small },
  ]);
  await modal.getByRole('checkbox', { name: 'Select along.txt', exact: true }).check();
  await modal.getByRole('checkbox', { name: 'Select ztiny.txt', exact: true }).check();
  const diskPane = modal.locator('.fm-pane-disk');
  const diskNames = () => diskPane.locator('.fm-disk-item:not(.dir) .fm-item-name').allTextContents();
  await interactWithDialog(page, () => modal.getByRole('button', { name: 'Copy to PC-98', exact: true }).click(), async dialog => {
    assert.equal(dialog.type(), 'confirm');
    assert.ok(dialog.message().includes('along.txt → ALONG.TXT'));
    await dialog.dismiss();
  });
  assert.deepEqual(await diskNames(), [], 'Cancelling the confirmation preserves the destination');

  const staged = modal.locator('.fm-staged-item').filter({ hasText: 'along.txt' });
  await interactWithDialog(page, () => staged.locator('.fm-item-name').dragTo(diskPane.locator('.fm-disk-list')), async dialog => {
    assert.equal(dialog.type(), 'confirm');
    await dialog.accept();
  });
  await modal.getByRole('status').getByText('2 file(s) transferred successfully.').waitFor();
  const progress = modal.locator('progress');
  assert.equal(await progress.getAttribute('max'), '2');
  assert.equal(await progress.getAttribute('value'), '2');
  assert.equal(await progress.isVisible(), false);
  assert.deepEqual(await diskNames(), ['ALONG.TXT', 'ZTINY.TXT']);
  await modal.getByRole('button', { name: /^Size/ }).click();
  assert.equal(await modal.getByRole('columnheader', { name: /^Size/ }).getAttribute('aria-sort'), 'ascending');
  assert.deepEqual(await diskNames(), ['ZTINY.TXT', 'ALONG.TXT']);
  await modal.getByRole('button', { name: /^Size/ }).click();
  assert.deepEqual(await diskNames(), ['ALONG.TXT', 'ZTINY.TXT']);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    diskPane.getByText('ALONG.TXT', { exact: true }).dragTo(modal.locator('.fm-staged-list')),
  ]);
  assert.equal(download.suggestedFilename(), 'ALONG.TXT');
  assert.deepEqual(await readFile(await download.path()), large);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();

  await openToolbarDialog(page, 'Input', 'Input Settings (Gamepad/Keyboard)');
  const input = page.locator('.gp-modal');
  await input.getByText(/No pad detected/).waitFor();
  assert.equal(await input.getByText(/No pad detected/).count(), 1);
  assert.equal(await input.locator('.gp-picker-section').isVisible(), false);
  await input.getByRole('button', { name: 'Keyboard', exact: true }).click();
  await input.getByRole('heading', { name: 'PC-98 key to assign', exact: true }).waitFor();
  assert.equal(await input.getByText(/No pad detected/).isVisible(), false);
  await input.getByRole('button', { name: 'Close', exact: true }).click();
  console.log('PASS: file transfer navigation, sort, confirmation, bidirectional drag, progress and gamepad empty state');
}
