import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

export const DEFAULT_ORIGINS = [
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:4173', 'http://127.0.0.1:4173',
  'https://kumakumapon.github.io',
];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Parse exact origins; wildcards, paths and opaque origins are rejected. */
export function parseOrigins(value) {
  return (value ? value.split(',') : DEFAULT_ORIGINS).map(origin => {
    const url = new URL(origin.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.trim()) {
      throw new Error('WEBNP2_BRIDGE_ORIGINS must contain exact HTTP(S) origins');
    }
    return url.origin;
  });
}

/** Loopback-only, capability-authenticated command bridge. No stdio side effects. */
export function createBridge({
  port = 3098, host = '127.0.0.1', origins = DEFAULT_ORIGINS,
  token = randomBytes(32).toString('base64url'), timeoutMs = 15000,
  log = (_message) => {},
} = {}) {
  if (!LOOPBACK.has(host) || host === '[::1]') throw new Error('Bridge host must be a loopback address');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid bridge port');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Bridge token must be 32-128 URL-safe characters');
  const allowedOrigins = new Set(origins);
  const credential = Buffer.from(`webnp2-token.${token}`);
  let activeClient = null;
  const pending = new Map();
  const wss = new WebSocketServer({
    port, host, maxPayload: 8 * 1024 * 1024, perMessageDeflate: false,
    handleProtocols: protocols => protocols.has('webnp2-bridge') ? 'webnp2-bridge' : false,
    verifyClient: ({ origin, req }, done) => {
      let validHost = false;
      try {
        const authority = new URL(`http://${req.headers.host}`);
        const address = wss.address();
        validHost = LOOPBACK.has(authority.hostname) && !authority.username && !authority.password &&
          authority.pathname === '/' && !authority.search && !authority.hash &&
          Number(authority.port || 80) === (typeof address === 'object' ? address?.port : port);
      } catch { /* Invalid Host is denied. */ }
      const protocols = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map(p => p.trim());
      const supplied = Buffer.from(protocols.find(p => p.startsWith('webnp2-token.')) ?? '');
      const paired = supplied.length === credential.length && timingSafeEqual(supplied, credential);
      done(validHost && allowedOrigins.has(origin) && paired && protocols.includes('webnp2-bridge'), 403);
    },
  });
  const ready = new Promise((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  wss.on('error', () => log('WebSocket bridge error'));
  function rejectClient(client) {
    for (const [id, entry] of pending) {
      if (entry.client !== client) continue;
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(new Error('BRIDGE_DISCONNECTED'));
    }
  }
  wss.on('connection', ws => {
    const greeting = setTimeout(() => ws.close(1008, 'Hello required'), 5000);
    ws.on('message', data => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg?.type === 'hello' && msg.role === 'webnp2') {
        if (activeClient && activeClient !== ws && activeClient.readyState === WebSocket.OPEN) {
          ws.close(1008, 'A browser is already paired');
          return;
        }
        clearTimeout(greeting);
        activeClient = ws;
        log('Active WebNP2 client registered');
        return;
      }
      if (ws !== activeClient || typeof msg?.id !== 'string') return;
      const entry = pending.get(msg.id);
      if (!entry || entry.client !== ws || typeof msg.ok !== 'boolean') return;
      clearTimeout(entry.timer);
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(typeof msg.error === 'string' ? msg.error : 'Browser command failed'));
    });
    ws.on('close', () => {
      clearTimeout(greeting);
      rejectClient(ws);
      if (activeClient === ws) activeClient = null;
    });
    ws.on('error', () => log('Browser socket error'));
  });
  function sendCommand(cmd, args = {}) {
    const client = activeClient;
    if (!client || client.readyState !== WebSocket.OPEN) return Promise.reject(new Error('BRIDGE_DISCONNECTED'));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for browser response to '${cmd}'`));
      }, timeoutMs);
      pending.set(id, { client, timer, resolve, reject });
      client.send(JSON.stringify({ id, cmd, args }), err => {
        if (!err || !pending.has(id)) return;
        pending.delete(id);
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  async function close() {
    for (const ws of wss.clients) {
      rejectClient(ws);
      ws.terminate();
    }
    await new Promise(resolve => wss.close(resolve));
  }
  return { ready, sendCommand, close, token, address: () => wss.address() };
}
