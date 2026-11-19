// Shared Playwright launcher for the DOS verifiers in both repositories.
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

/**
 * Playwright's injected wait treats a returned Promise as truthy before
 * awaiting its value. Disk reads must finish before deciding to stop polling.
 * @template T
 * @param {{evaluate: (fn: (arg: T) => Promise<unknown>, arg: T) => Promise<unknown>}} page
 * @param {(arg: T) => Promise<unknown>} predicate
 * @param {T} argument
 * @param {{timeout?: number, polling?: number | 'raf'}} options
 */
export async function waitForAsyncPredicate(page, predicate, argument, options = {}) {
  const { timeout = 30_000, polling = 50 } = options;
  const interval = typeof polling === 'number' ? polling : 50;
  const deadline = Date.now() + timeout;
  const timeoutError = new Error(`Asynchronous guest condition was not met within ${timeout} ms`);
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError), timeout); });
  try {
    while (Date.now() < deadline) {
      if (await Promise.race([page.evaluate(predicate, argument), expired])) return;
      await Promise.race([delay(interval), expired]);
    }
    throw timeoutError;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The shared DOS assertions use a small interface inherited from the original
 * verifiers. Translate it at the browser boundary so copied assertions remain
 * byte-for-byte identical in the native and web repositories.
 * @param {{executablePath?: string, args?: string[], timeout?: number, headless?: boolean, deviceScaleFactor?: number}} options
 */
export async function launchDosBrowser(options = {}) {
  const { deviceScaleFactor = 1, ...launch } = options;
  const browser = await chromium.launch(launch);
  return {
    close: () => browser.close(),
    version: () => browser.version(),
    async newPage() {
      const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor });
      context.setDefaultTimeout(30_000);
      const page = await context.newPage();
      /** @param {{waitUntil?: "load" | "domcontentloaded" | "networkidle2" | "commit", timeout?: number}} opts */
      const navigation = (opts = {}) => ({
        ...opts,
        waitUntil: opts.waitUntil === 'networkidle2' ? /** @type {const} */ ('networkidle') : opts.waitUntil,
      });
      return {
        close: () => context.close(),
        keyboard: page.keyboard,
        mouse: page.mouse,
        $: page.$.bind(page),
        $$: page.$$.bind(page),
        $eval: page.$eval.bind(page),
        $$eval: page.$$eval.bind(page),
        evaluate: page.evaluate.bind(page),
        evaluateHandle: page.evaluateHandle.bind(page),
        on: page.on.bind(page),
        screenshot: page.screenshot.bind(page),
        focus: page.focus.bind(page),
        click: page.click.bind(page),
        select: page.selectOption.bind(page),
        route: page.route.bind(page),
        setInputFiles: page.setInputFiles.bind(page),
        evaluateOnNewDocument: page.addInitScript.bind(page),
        setViewport: ({ width, height }) => page.setViewportSize({ width, height }),
        goto: (url, opts) => page.goto(url, navigation(opts)),
        reload: opts => page.reload(navigation(opts)),
        waitForNavigation: opts => page.waitForNavigation(navigation(opts)),
        waitForSelector: (selector, opts) => page.waitForSelector(selector, { state: 'attached', ...opts }),
        async waitForFunction(predicate, opts, argument) {
          if (predicate.constructor.name === 'AsyncFunction') {
            return waitForAsyncPredicate(page, predicate, argument, opts);
          }
          const result = await page.waitForFunction(predicate, argument, opts);
          await result.dispose();
        },
      };
    },
  };
}
