import assert from 'node:assert/strict';

// Browser events use physical DOM codes, so JIS punctuation is tested independently
// of Puppeteer's US-only keyboard layout. Composition events model committed OS IME text.
export async function verifyJapaneseInput(page, { screenshot } = {}) {
  const screen = () => page.evaluate(() => window.np2debug.np2.getScreenText().text);
  const wait = async needle => page.waitForFunction(
    needle => window.np2debug?.np2?.getScreenText().text.includes(needle),
    { timeout: 30000 }, needle,
  ).catch(async error => { console.error(await screen()); throw error; });
  const type = value => page.evaluate(value => window.np2debug.np2.typeText(value), value);
  const key = value => page.evaluate(value => window.np2debug.np2.sendKeys(value), value);
  const physical = async (code, down, key = '') => {
    await page.evaluate(({code, down, key}) => document.activeElement.dispatchEvent(new KeyboardEvent(
      down ? 'keydown' : 'keyup', { code, key, bubbles: true, cancelable: true },
    )), {code, down, key});
    await new Promise(resolve => setTimeout(resolve, 50));
  };
  const press = async (code, key = '') => { await physical(code, true, key); await physical(code, false, key); };
  const layout = async (value, mapping = false) => {
    // Open Input settings through its toolbar control, then change the rendered selector.
    await page.evaluate(() => document.querySelector('button[aria-label="Input Settings (Gamepad/Keyboard)"]').click());
    await page.waitForSelector('.gp-modal-backdrop:not(.hidden)');
    await page.click('.gp-tabs .gp-tab:nth-child(2)');
    await page.select('#gp-keyboard-layout', value);
    if (mapping) await page.click('#gp-hk-enable');
    assert.equal(await page.evaluate(() => localStorage.getItem('webnp2.keyboard-layout')), value);
    await page.click('.gp-modal .rom-close-btn');
    await page.focus('canvas');
  };
  await layout('jis');
  await type('EDIT KEYS.TXT\r'); await wait('EDIT98 - Shift_JIS');
  for (const code of ['BracketLeft','Quote','Equal','IntlYen','Backslash']) await press(code);
  await physical('ShiftLeft', true, 'Shift'); await press('IntlRo'); await press('Digit2');
  await physical('ShiftLeft', false, 'Shift');
  await wait('@:^');
  await key('F3'); await wait('Saved (Shift_JIS / CRLF)');
  const read = async name => Buffer.from(await page.evaluate(async name =>
    Array.from(await window.np2debug.np2.diskReadFile('fd1', name)), name));
  assert.deepEqual(await read('KEYS.TXT'), Buffer.from('@:^\\]_"'));
  await key('F10'); await wait('EDIT98 exited.');
  await type('EDIT IME.TXT\r'); await wait('EDIT98 - Shift_JIS');
  await layout('jis', true);
  for (let i = 0; i < 2; i++) await press('ShiftLeft', 'Shift');
  await page.waitForSelector('.paste-bar:not(.hidden)');
  await page.click('.paste-bar-close-btn'); await page.focus('canvas');
  await press('Backquote', 'ZenkakuHankaku');
  await page.waitForSelector('.paste-bar:not(.hidden)');
  assert.ok(await page.$('.paste-bar-setup.hidden'), 'Bundled Japanese DOS needs no TSR setup');
  // A user mapping must not intercept the IME field at the window capture stage.
  await page.evaluate(() => {
    const field = document.querySelector('.paste-bar-input');
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }));
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    field.value = 'にほんご';
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', keyCode: 229, bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', isComposing: true, keyCode: 229, bubbles: true }));
  });
  assert.ok(!(await screen()).includes('にほんご'));
  assert.ok(await page.$('.paste-bar:not(.hidden)'), 'IME cancellation must not close the input field');
  await page.click('.paste-bar-send-btn'); // composing text must not be sent
  assert.ok(!(await screen()).includes('にほんご'));
  await page.evaluate(() => {
    const field = document.querySelector('.paste-bar-input'); field.value = '日本語';
    field.dispatchEvent(new CompositionEvent('compositionend', { data: '日本語', bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
  });
  assert.ok(!(await screen()).includes('日本語'), 'Composition-ending Enter must not send');
  await page.click('.paste-bar-send-btn'); await wait('日本語');
  await page.waitForFunction(() => document.querySelector('.paste-bar-input').value === '');
  const before = await screen();
  await page.$eval('.paste-bar-input', input => { input.value = 'A😀B'; });
  await page.click('.paste-bar-send-btn');
  await page.waitForFunction(() => document.body.textContent.includes('outside Shift_JIS'));
  assert.equal(await page.$eval('.paste-bar-input', input => input.value), 'A😀B');
  assert.equal(await screen(), before, 'Unsupported text is rejected before any byte enters DOS');
  await page.$eval('.paste-bar-input', input => { input.value = 'ｶﾅ'; });
  await page.click('.paste-bar-enter-checkbox'); await page.click('.paste-bar-send-btn'); await wait('日本語ｶﾅ');
  await page.click('.paste-bar-close-btn'); await page.focus('canvas');
  await key('F3'); await wait('Saved (Shift_JIS / CRLF)');
  assert.deepEqual(await read('IME.TXT'), Buffer.from([0x93,0xfa,0x96,0x7b,0x8c,0xea,0xb6,0xc5,13,10]));
  if (screenshot) await page.screenshot({ path: screenshot });
  await key('F10'); await wait('EDIT98 exited.');
  await layout('us');
  await type('EDIT USKEYS.TXT\r'); await wait('EDIT98 - Shift_JIS');
  await page.keyboard.down('u'); await new Promise(resolve => setTimeout(resolve, 50)); await page.keyboard.up('u');
  await page.keyboard.down('s'); await new Promise(resolve => setTimeout(resolve, 50)); await page.keyboard.up('s');
  await key('F3'); await wait('Saved (Shift_JIS / CRLF)');
  assert.deepEqual(await read('USKEYS.TXT'), Buffer.from('us'));
  await key('F1'); await wait('native PC-98 text editor / 16 KiB'); await key('SPACE');
  await key('F4'); await wait('Save as:'); await key('CTRL+U'); await type('USCOPY.TXT\r');
  await wait('Saved (Shift_JIS / CRLF)'); assert.deepEqual(await read('USCOPY.TXT'), Buffer.from('us'));
  await key('F2'); await wait('Open / new file:'); await key('CTRL+U'); await type('USKEYS.TXT\r');
  await wait('Opened'); await key('CTRL+E'); await type('X');
  await key('F4'); await wait('Save as:'); await key('CTRL+U'); await type('USCOPY.TXT\r');
  await wait('Destination exists. Replace?'); await key('N');
  await wait('EDIT98 - Shift_JIS'); assert.deepEqual(await read('USCOPY.TXT'), Buffer.from('us'));
  await key('F10'); await wait('Unsaved changes'); await key('Y'); await wait('EDIT98 exited.');
  assert.deepEqual(await read('USKEYS.TXT'), Buffer.from('usX'));
  await page.evaluate(() => window.np2debug.np2.persistNow({ force: true }));
  await page.reload({ waitUntil: 'networkidle2' });
  assert.equal(await page.evaluate(() => localStorage.getItem('webnp2.keyboard-layout')), 'us');
  await wait('A>');
  await type('CLS\rTYPE IME.TXT\r'); await wait('日本語ｶﾅ');
  return ['JIS physical @ : ^ yen/bracket/underscore/shifted quote; saved selector; US regression',
    'OS IME composition withheld, no confirm-Enter leak, committed Japanese/kana through UI',
    'editor help, F2 open, Save as, overwrite cancellation and save-on-quit',
    'unsupported-character rejection preserves text; actual Shift_JIS/CRLF file persists after reload'];
}
