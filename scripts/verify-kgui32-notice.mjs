import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function verifyDesktopNotice({ page, s, output, pixels, click, start }) {
  const left = (s.width - 512) / 2;
  const top = s.height - 32 - 8 - 36;
  const stripe = [left + 2, top + 16];
  const [before] = await pixels([stripe]);
  const running = await start();
  const deadline = Date.now() + 1500;
  let displayed = false;
  while (Date.now() < deadline) {
    const [color] = await pixels([stripe]);
    if (color[1] > color[0] && color[1] > color[2] &&
        color.some((component, index) => component !== before[index])) {
      displayed = true;
      break;
    }
    await page.waitForTimeout(40);
  }
  assert.ok(displayed, 'The desktop presents a success notice above the taskbar');
  await page.screenshot({ path: join(output, 'worker-notice.png') });
  await click(left + 490, top + 18);
  const restoreDeadline = Date.now() + 3000;
  while (Date.now() < restoreDeadline) {
    const [color] = await pixels([stripe]);
    if (color.every((component, index) => component === before[index])) return running;
    await page.waitForTimeout(40);
  }
  assert.fail('Dismissing the notice restores the previously covered framebuffer');
}
