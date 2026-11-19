import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForAsyncPredicate } from '../legacy-browser.mjs';

test('a resolved false result from a guest disk read keeps polling', async () => {
  let reads = 0;
  const page = { evaluate: (predicate, argument) => predicate(argument) };
  await waitForAsyncPredicate(page, async expected => ++reads === expected, 3, { timeout: 500, polling: 1 });
  assert.equal(reads, 3);
});

test('an unresponsive guest read is bounded by the wait deadline', async () => {
  const page = { evaluate: () => new Promise(() => {}) };
  await assert.rejects(
    waitForAsyncPredicate(page, async () => false, undefined, { timeout: 30 }),
    /not met within 30 ms/,
  );
});
