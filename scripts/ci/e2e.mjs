// Actions-only process owner. Importing the suite planner never starts a server.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { listCases } from './plan.mjs';
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Browser E2E servers run only in GitHub Actions');
const suite = listCases().find(item => item.id === process.argv[2]);
if (!suite) throw new Error('Unknown E2E case');
const children = new Set();
function launch(argv, options = {}) {
  const child = spawn(process.execPath, argv, { detached: true, stdio: 'inherit', ...options });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve(undefined) : reject(new Error(`Child failed: ${code ?? signal}`)));
  });
  // Observe failures immediately, even while waiting for HTTP readiness.
  void done.catch(() => {});
  const entry = { child, done };
  children.add(entry);
  void done.finally(() => children.delete(entry)).catch(() => {});
  return entry;
}
async function stop(entry) {
  if (entry.child.exitCode !== null || entry.child.signalCode !== null) return;
  try { process.kill(-entry.child.pid, 'SIGTERM'); } catch { /* already exited */ }
  await Promise.race([entry.done.catch(() => {}), delay(5000, undefined, {ref:false})]);
  if (entry.child.exitCode === null && entry.child.signalCode === null) {
    try { process.kill(-entry.child.pid, 'SIGKILL'); } catch { /* already exited */ }
    await entry.done.catch(() => {});
  }
}
async function stopAll() { await Promise.all([...children].map(stop)); }
const onSignal = () => { void stopAll().then(() => { process.exitCode = 1; }); };
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
mkdirSync('test-results', {recursive:true});
const log = openSync('test-results/preview.log', 'w');
try {
  const server = launch(['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort', '--base', suite.base], { stdio: ['ignore', log, log] });
  const url = `http://127.0.0.1:4173${suite.base}`;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.child.exitCode !== null) throw new Error('Preview exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* starting */ }
    await delay(1000);
  }
  if (!ready) throw new Error('Preview readiness timed out');
  for (const command of suite.commands) {
    console.log('Running', command.argv.join(' '));
    await launch(command.argv, { env: { ...process.env, CHROMIUM: '/usr/bin/google-chrome', WEBNP2_NO_SANDBOX: '1', ...command.env } }).done;
  }
} finally {
  await stopAll();
  closeSync(log);
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}
