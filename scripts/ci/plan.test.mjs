import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { listCases } from './plan.mjs';
test('keeps every E2E verifier, with the three long groups split into one case each', () => {
  const cases = listCases();
  assert.equal(cases.length, 124);
  assert.deepEqual(cases.find(item => item.id === 'browser').directories, ['test-results/dos2']);
  assert.equal(new Set(cases.map(item => item.id)).size, 124);
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
    const standalone = cases.find(item => item.id === `hdd-standalone-${video}`);
    assert.deepEqual(standalone.commands.map(command => command.argv.at(-1)), ['standalone']);
    assert.equal(standalone.commands[0].env.KGUI32_STANDALONE_REPEATS, '5');
    assert.equal(cases.find(item => item.id === `kgui32-save-${video}`).commands.length, 3);
    for (const [id, script] of [
      ['kgui32', 'verify-kgui32'], ['kgui32-sessions', 'verify-kgui32-sessions'],
      ['kgui32-clients', 'verify-kgui32-clients'], ['kgui32-browser', 'verify-kgui32-browser'],
      ['hdd-applications', 'verify-kgui32-hdd-apps'], ['kgui32-start', 'verify-kgui32-start'],
      ['shell-files', 'verify-kgui32-shell-files'], ['kdesk-clipboard', 'verify-kgui32-kdesk-clipboard'],
      ['recovery-interop', 'verify-kgui32-recovery-interop'], ['hdd-workspace', 'verify-kgui32-hdd-workspace'],
      ['kgui32-standard', 'verify-kgui32-standard'], ['workspace-shell', 'verify-kgui32-workspace-shell'],
    ]) {
      const item = cases.find(entry => entry.id === `${id}-${video}`);
      assert.deepEqual(item.commands.map(command => command.argv[0]), [`scripts/${script}.mjs`], id);
      assert.equal(item.timeout, 30, id);
    }
  }
});
test('keeps clk=8 only for the verifiers that exposed KGUI32 races (MS-DOS #87)', () => {
  const pinned = listCases().flatMap(item => item.commands
    .filter(command => command.env.WEBNP2_E2E_CLK !== undefined)
    .map(command => [item.id, command.argv[0], command.env.WEBNP2_E2E_CLK]));
  assert.ok(pinned.every(([, , clock]) => clock === '8'));
  assert.deepEqual([...new Set(pinned.map(([, script]) => script))].sort(), [
    'scripts/verify-kgui32-japanese.mjs',
    'scripts/verify-kgui32-shell-files.mjs',
    'scripts/verify-kgui32-terminal.mjs',
  ]);
  assert.equal(pinned.length, 2 + 4 + 4);
  assert.deepEqual(pinned.filter(([id]) => id.startsWith('shell-files-')).length, 2);
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
