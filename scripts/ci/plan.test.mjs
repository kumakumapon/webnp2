import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { listCases } from './plan.mjs';
test('keeps 102 existing E2E cases and adds desktop settings on both video modes', () => {
  const cases = listCases();
  assert.equal(cases.length, 104);
  assert.deepEqual(cases.find(item => item.id === 'browser').directories, ['test-results/dos2']);
  assert.equal(new Set(cases.map(item => item.id)).size, 104);
  for (const item of cases) {
    assert.ok(item.timeout > 0 && item.timeout <= 60);
    for (const { argv } of item.commands) {
      assert.ok(existsSync(argv[0]), argv[0]);
      assert.ok(argv.every(word => !/[{}]/.test(word)), item.id);
    }
  }
  assert.equal(cases.find(item => item.id === 'native-tools').commands[2].env.K386_LATENCY_GATE, '1');
  for (const video of ['pegc', 'cirrus']) {
    assert.equal(cases.filter(item => item.id.startsWith(`practical32-${video}-`)).length, 10);
    assert.equal(cases.find(item => item.id === `desktop-settings-${video}`).commands.length, 1);
    const standalone = cases.find(item => item.id === `hdd-applications-${video}`);
    assert.equal(standalone.commands[1].env.KGUI32_STANDALONE_REPEATS, '5');
    assert.equal(cases.find(item => item.id === `kgui32-save-${video}`).commands.length, 3);
    assert.equal(cases.find(item => item.id === `kgui32-${video}`).commands.length, 4);
  }
});
test('E2E runner refuses to start a local preview outside Actions', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/e2e.mjs', 'browser'], {encoding:'utf8', env:{...process.env,GITHUB_ACTIONS:''}, timeout:3000});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /only in GitHub Actions/);
});

import { documentationOnly } from './changed-docs.mjs';
test('only known documentation paths can skip browser CI', () => {
  assert.equal(documentationOnly(['README.ja.md', 'docs/ci/one.md']), true);
  for (const path of ['scripts/verify.mjs', 'package-lock.json', '.github/workflows/ci.yml', 'public/help.html', 'src/main.ts']) {
    assert.equal(documentationOnly(['README.md', path]), false);
  }
  assert.equal(documentationOnly([]), false);
});
