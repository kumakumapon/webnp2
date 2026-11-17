import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createBridge, parseOrigins, DEFAULT_ORIGINS } from '../bridge.mjs';

const token = 'unit-test-capability-not-a-real-secret';
const origin = 'http://localhost:5173';
async function fixture(run, options = {}) {
  let registered;
  const registration = new Promise(resolve => { registered = resolve; });
  const bridge = createBridge({ port: 0, token, timeoutMs: 120, log: () => registered(), ...options });
  const clients = [];
  try {
    await bridge.ready;
    const url = `ws://127.0.0.1:${bridge.address().port}`;
    const connect = async (opts = {}) => {
      const ws = new WebSocket(url, ['webnp2-bridge', `webnp2-token.${token}`], { origin, ...opts });
      clients.push(ws);
      await once(ws, 'open');
      return ws;
    };
    const pair = async () => {
      const ws = await connect();
      ws.send(JSON.stringify({ type: 'hello', role: 'webnp2' }));
      await registration;
      return ws;
    };
    await run({ bridge, url, connect, pair, clients });
  } finally {
    for (const ws of clients) ws.terminate();
    await bridge.close();
  }
}

test('defaults bind IPv4 loopback, require exact origins and forbid wildcard hosts', async () => {
  assert.throws(() => createBridge({ host: '0.0.0.0' }), /loopback/);
  assert.throws(() => createBridge({ token: 'weak' }), /token/);
  assert.throws(() => parseOrigins('https://example.com/path'), /exact/);
  assert.throws(() => parseOrigins('*'));
  assert.deepEqual(parseOrigins('http://localhost:6000'), ['http://localhost:6000']);
  assert.deepEqual(parseOrigins(), DEFAULT_ORIGINS);
  await fixture(async ({ bridge }) => assert.equal(bridge.address().address, '127.0.0.1'));
});

test('reject absent/foreign/null origins, wrong token and rebinding Host before upgrade', async () => {
  await fixture(async ({ url, clients }) => {
    for (const opts of [
      {}, { origin: 'null' }, { origin: 'https://attacker.example' },
      { origin, headers: { Host: 'attacker.example' } },
      { origin, headers: { Host: '127.0.0.1:1' } },
    ]) {
      const ws = new WebSocket(url, ['webnp2-bridge', `webnp2-token.${token}`], opts);
      clients.push(ws);
      await assert.rejects(once(ws, 'open'), /403/);
    }
    const ws = new WebSocket(url, ['webnp2-bridge', 'webnp2-token.wrong'], { origin });
    clients.push(ws);
    await assert.rejects(once(ws, 'open'), /403/);
  });
});

test('active browser alone receives commands and can complete a random-ID request', async () => {
  await fixture(async ({ bridge, pair, connect }) => {
    const active = await pair();
    const stranger = await connect();
    let leaked = false;
    stranger.on('message', () => { leaked = true; });
    const command = once(active, 'message');
    const result = bridge.sendCommand('put_file', { text: 'private file' });
    const request = JSON.parse((await command)[0]);
    assert.match(request.id, /^[a-f\d-]{36}$/);
    let resolved = false;
    void result.then(() => { resolved = true; });
    stranger.send(JSON.stringify({ id: request.id, ok: true, result: 'spoof' }));
    const pong = once(stranger, 'pong');
    stranger.ping();
    await pong;
    assert.equal(resolved, false);
    active.send(JSON.stringify({ id: request.id, ok: true, result: 'genuine' }));
    assert.equal(await result, 'genuine');
    assert.equal(leaked, false);
    const closed = once(stranger, 'close');
    stranger.send(JSON.stringify({ type: 'hello', role: 'webnp2' }));
    assert.equal((await closed)[0], 1008);
    assert.equal(active.readyState, WebSocket.OPEN);
  });
});

test('disconnect rejects outstanding requests immediately', async () => {
  await fixture(async ({ bridge, pair }) => {
    const active = await pair();
    const command = once(active, 'message');
    const failed = assert.rejects(bridge.sendCommand('screen_text'), /BRIDGE_DISCONNECTED/);
    await command;
    active.close();
    await failed;
    await assert.rejects(bridge.sendCommand('screen_text'), /BRIDGE_DISCONNECTED/);
  });
});

test('browser errors and request timeout are bounded; shutdown rejects pending work', async () => {
  await fixture(async ({ bridge, pair }) => {
    const active = await pair();
    const command = once(active, 'message');
    const failed = assert.rejects(bridge.sendCommand('bad'), /denied/);
    const request = JSON.parse((await command)[0]);
    active.send(JSON.stringify({ id: request.id, ok: false, error: 'denied' }));
    await failed;
    await assert.rejects(bridge.sendCommand('silent'), /Timed out/);
    const shutdown = assert.rejects(bridge.sendCommand('pending'), /BRIDGE_DISCONNECTED/);
    await bridge.close();
    await shutdown;
  });
});
