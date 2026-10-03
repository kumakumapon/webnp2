// Integration checks for the actual OS launcher; also run on Windows in Actions.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === 'win32';
const script = join(root, isWindows ? 'start-windows.cmd' : 'start-linux.sh');
const cwd = await mkdtemp(join(tmpdir(), 'webnp2 launcher '));
const children = [];

function launch(args) {
  // The arguments here are fixed test cases and a numeric port.
  const child = isWindows
    ? spawn(`"${script}" ${args.join(' ')}`, { cwd, shell: true })
    : spawn(script, args, { cwd, detached: true });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });
  const entry = { child, done, output: () => output };
  children.push(entry);
  return entry;
}

async function exit(entry) {
  const code = await Promise.race([
    entry.done,
    delay(60000, undefined, { ref: false }).then(() => { throw new Error(`Launcher timed out:\n${entry.output()}`); }),
  ]);
  return code;
}

async function stop(entry) {
  if (entry.child.exitCode !== null || entry.child.signalCode !== null) return;
  if (isWindows) {
    const kill = spawn('taskkill', ['/pid', String(entry.child.pid), '/t', '/f'], { stdio: 'ignore' });
    await new Promise(resolve => kill.once('exit', resolve));
  } else {
    process.kill(-entry.child.pid, 'SIGTERM');
  }
  await entry.done;
}

try {
  const help = launch(['--help']);
  assert.equal(await exit(help), 0, help.output());
  assert.match(help.output(), /--no-open/);
  const invalid = launch(['--port', '0']);
  assert.equal(await exit(invalid), 1, invalid.output());
  assert.match(invalid.output(), /1 to 65535/);
  assert.doesNotMatch(invalid.output(), /Preparing/);

  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = launch(['--no-open', '--install', '--port', String(port)]);
  const base = `http://127.0.0.1:${port}/`;
  let ready = false;
  for (let i = 0; i < 600; i++) {
    if (server.child.exitCode !== null) throw new Error(server.output());
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Installation/startup is still in progress. */ }
    await delay(100);
  }
  assert.ok(ready, `Server did not become ready:\n${server.output()}`);
  assert.match(server.output(), /Preparing WebNP2 dependencies/);
  assert.match(await (await fetch(base)).text(), /WebNP2/);
  assert.equal((await fetch(`${base}src/main.ts`)).status, 200);
  assert.equal((await fetch(`${base}core/emnp21kai_sdl2.wasm`)).status, 200);
  assert.equal((await (await fetch(`${base}freedos/fd98_2hd.xdf`)).arrayBuffer()).byteLength, 1261568);

  const occupied = launch(['--no-open', '--port', String(port)]);
  assert.equal(await exit(occupied), 1, occupied.output());
  assert.match(occupied.output(), /already in use/);
  assert.doesNotMatch(occupied.output(), /Preparing WebNP2 dependencies/);
  await stop(server);
  await assert.rejects(fetch(base, { signal: AbortSignal.timeout(1000) }));
  console.log('PASS: help, invalid port, forced install, launch from another directory, HTTP/core/disk serving, cached dependencies, occupied port and shutdown');
} finally {
  for (const entry of children) await stop(entry);
  await rm(cwd, { recursive: true, force: true });
}
