// Real DOM events exercise host synchronization as well as the guest mouse.
export async function verifyWindowPointer(page, { screenshot } = {}) {
  await page.setViewport({ width: 1000, height: 780 });
  const wait = needle => page.waitForFunction(
    needle => window.np2debug.np2.getScreenText().text.includes(needle), { timeout: 60000 }, needle);
  const title = (name, row, column) => page.waitForFunction(
    ({ name, row, column }) => window.np2debug.np2.getScreenText().lines[row]?.indexOf(name) === column,
    { timeout: 60000 }, { name, row, column });
  const coords = async (x, y) => page.$eval('#canvas', (canvas, { x, y }) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + x * rect.width / canvas.width, y: rect.y + y * rect.height / canvas.height };
  }, { x, y });
  const click = async (x, y) => {
    const point = await coords(x, y);
    // No pre-move or homing delay: the very first quick click must reach Memo.
    await page.mouse.click(point.x, point.y, { delay: 20 });
  };
  await page.evaluate(() => window.np2debug.np2.typeText('KDESK\r'));
  await wait('Ready');
  await click(340, 8); await title('Memo', 5, 13); await wait('NOTE.TXT');
  const from = await coords(160, 88), to = await coords(210, 122);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y); await page.mouse.up();
  await title('Memo', 7, 19);
  // Releasing outside canvas still reaches the guest, and geometry is clipped.
  const start = await coords(210, 122), outside = await coords(700, -30);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(outside.x, outside.y); await page.mouse.up();
  await title('Memo', 2, 33);
  await click(604, 40);
  await page.waitForFunction(() => !window.np2debug.np2.getScreenText().text.includes('Memo '));
  await click(404, 8); await wait('Drag title: move');
  const helpTitle = await coords(160, 104);
  await page.mouse.move(helpTitle.x, helpTitle.y); await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await click(592, 8); await wait('KDESK exited.');
  const prompt = () => page.waitForFunction(() => window.np2debug.np2.getScreenText().lines.some(
    line => line.trim() === 'A>'), { timeout: 60000 });
  await prompt();
  // Keep the screenshot at the useful new desktop state, without changing files.
  if (screenshot) {
    await page.evaluate(() => window.np2debug.np2.typeText('KDESK\r'));
    await wait('Ready'); await page.screenshot({ path: screenshot });
    await page.evaluate(() => window.np2debug.np2.sendKeys('F10'));
    await wait('KDESK exited.');
    await prompt();
  }
  return ['canvas first-click homing, quick title drag, release outside canvas/blur, clipping and subsequent clicks'];
}
