import assert from 'node:assert/strict';

export async function verifyDiskLibrary(browser, base, boot) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    await page.goto(new URL('?lang=en', base).href);
    await page.locator('.start-btn-msdos2').waitFor();
    const seed = await page.evaluateHandle(async (diskUrl) => {
      const response = await fetch(diskUrl);
      if (!response.ok) throw new Error(`MS-DOS disk fixture failed to load (${response.status})`);
      return [
        { sourceKey: 'file:older.xdf:2', name: 'older.xdf', displayName: 'Disk2',
          bytes: new Uint8Array([1, 2]).buffer, savedAt: 1, lastUsedAt: 2000 },
        { sourceKey: 'file:actual.xdf:boot', name: 'actual.xdf', displayName: 'Disk10',
          bytes: await response.arrayBuffer(), savedAt: 3000 },
        { sourceKey: 'arc:test/games.xdf', group: 'arc:test', groupName: 'Archive', groupIndex: 0,
          name: 'games.xdf', bytes: new Uint8Array([3, 4]).buffer, savedAt: 4000 },
        { sourceKey: 'arc:test/work.hdi', group: 'arc:test', groupName: 'Archive', groupIndex: 1,
          name: 'work.hdi', bytes: new Uint8Array([5, 6]).buffer, savedAt: 5000 },
      ];
    }, new URL(boot).searchParams.get('fd1'));
    const writeImages = entries => page.evaluate(records => new Promise((resolve, reject) => {
      const open = indexedDB.open('webnp2', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('images', { keyPath: 'sourceKey' });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('images', 'readwrite');
        for (const entry of records) tx.objectStore('images').put(entry);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }), entries);
    // Seed this new context through the same store the UI reads.
    await writeImages(seed);
    await seed.dispose();

    const modal = page.getByRole('dialog', { name: 'Disk Library' });
    const rowActions = page.locator('#library-actions-menu');
    const openLibrary = async () => {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.locator('.toolbar-overflow-menu').getByRole('menuitem', { name: /Disk/ }).click();
      await page.getByRole('menuitem', { name: 'Disk Library' }).click();
      await modal.waitFor();
      await modal.locator('.library-list[aria-busy="false"]').waitFor();
      await modal.getByRole('button', { name: 'More actions for Disk2' }).waitFor();
    };
    await openLibrary();
    const search = modal.getByRole('searchbox', { name: 'Search disks' });
    const sort = modal.getByRole('combobox', { name: 'Sort disks' });
    const ungrouped = modal.locator('.library-list > .library-list-item .library-item-name');
    assert.deepEqual(await ungrouped.allTextContents(), ['Disk2', 'Disk10']);
    await sort.selectOption('updated');
    assert.deepEqual(await ungrouped.allTextContents(), ['Disk10', 'Disk2']);
    await sort.selectOption('used');
    assert.deepEqual(await ungrouped.allTextContents(), ['Disk2', 'Disk10']);
    await search.fill('ＡＲＣＨＩＶＥ');
    await modal.locator('.library-item-name', { hasText: 'games.xdf' }).waitFor();
    assert.equal(await ungrouped.count(), 0);
    await search.fill('games.xdf');
    assert.deepEqual(await modal.locator('.library-item-name').allTextContents(), ['games.xdf']);
    await search.fill('unmatched');
    await modal.getByText('No matching disks.').waitFor();
    await search.fill('');

    const archiveActions = modal.getByRole('button', { name: 'More actions for Archive' });
    await archiveActions.click();
    page.once('dialog', prompt => prompt.accept());
    await rowActions.getByRole('menuitem', { name: 'Delete' }).click();
    await archiveActions.waitFor({ state: 'hidden' });
    await modal.getByRole('button', { name: 'Undo' }).click();
    await archiveActions.waitFor();
    const readArchive = () => page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('webnp2', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        const images = await new Promise((resolve, reject) => {
          const req = db.transaction('images').objectStore('images').getAll(IDBKeyRange.bound('arc:test/', 'arc:test/\uffff'));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        return images.map(image => ({
          group: image.group, groupName: image.groupName, groupIndex: image.groupIndex,
          savedAt: image.savedAt, bytes: [...new Uint8Array(image.bytes)],
        }));
      } finally {
        db.close();
      }
    });
    assert.deepEqual(await readArchive(), [
      { group: 'arc:test', groupName: 'Archive', groupIndex: 0, savedAt: 4000, bytes: [3, 4] },
      { group: 'arc:test', groupName: 'Archive', groupIndex: 1, savedAt: 5000, bytes: [5, 6] },
    ]);

    await archiveActions.click();
    page.once('dialog', prompt => prompt.accept());
    await rowActions.getByRole('menuitem', { name: 'Delete' }).click();
    await archiveActions.waitFor({ state: 'hidden' });
    const collision = await page.evaluateHandle(() => [{
      sourceKey: 'arc:test/work.hdi', group: 'arc:test', groupName: 'Archive', groupIndex: 1,
      name: 'work.hdi', bytes: new Uint8Array([7, 8]).buffer, savedAt: 6000,
    }]);
    await writeImages(collision);
    await collision.dispose();
    await modal.getByRole('button', { name: 'Undo' }).click();
    await modal.getByRole('alert').waitFor();
    assert.deepEqual(await readArchive(), [
      { group: 'arc:test', groupName: 'Archive', groupIndex: 1, savedAt: 6000, bytes: [7, 8] },
    ], 'Undo must preserve the newer image and abort restoration of the other archive entries');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await openLibrary();

    await search.fill('work.hdi');
    await modal.getByRole('button', { name: 'More actions for work.hdi' }).click();
    await rowActions.getByRole('menuitem', { name: 'Set as HDD' }).click();
    await modal.waitFor({ state: 'hidden' });
    await page.locator('[data-drive="hdd"] .drive-name-button', { hasText: 'work.hdi' }).waitFor();
    await openLibrary();
    await archiveActions.click();
    assert.equal(await rowActions.getByRole('menuitem', { name: 'A disk in use cannot be deleted' })
      .getAttribute('aria-disabled'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await archiveActions.getAttribute('aria-expanded'), 'false');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('[data-drive="hdd"]').getByRole('button', { name: 'Remove the selected HDD' }).click();

    await openLibrary();
    await modal.locator('.library-primary', { hasText: 'Disk10' }).click();
    await page.waitForFunction(() => {
      const guest = window.np2debug?.np2;
      return guest?.isBooted() && guest.getScreenText().lines.some(line => line.trim() === 'A>');
    }, null, { timeout: 60_000 });
    await openLibrary();
    await sort.selectOption('used');
    assert.equal(await ungrouped.first().textContent(), 'Disk10');
    await modal.getByRole('button', { name: 'More actions for Disk10' }).click();
    assert.equal(await rowActions.getByRole('menuitem', { name: 'A disk in use cannot be deleted' })
      .getAttribute('aria-disabled'), 'true');
    console.log('PASS: disk library search, sorting, atomic archive undo, pending and mounted disk protection, and primary boot action');
  } finally {
    await page.close();
  }
}
