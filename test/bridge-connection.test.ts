import { describe, expect, it, vi } from 'vitest';
import { resolveBridgeConnection } from '../src/api/bridge-connection.ts';
const token = 'unit-test-capability-not-a-real-secret';
const hash = `#bridge-token=${token}`;
describe('explicit MCP pairing URL', () => {
  it('leaves the bridge disabled without opt-in or a private token', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(resolveBridgeConnection(new URLSearchParams(), hash)).toBeUndefined();
      expect(resolveBridgeConnection(new URLSearchParams('bridge=1'), '')).toBeUndefined();
      expect(resolveBridgeConnection(new URLSearchParams('bridge=1&bridge-token=exposed'), '')).toBeUndefined();
    } finally { log.mockRestore(); }
  });
  it('keeps the token out of the websocket URL', () => {
    expect(resolveBridgeConnection(new URLSearchParams('bridge=1'), hash)).toEqual({ url: 'ws://127.0.0.1:3098/', token });
    expect(resolveBridgeConnection(new URLSearchParams('bridge=4000'), hash)?.url).toBe('ws://127.0.0.1:4000/');
    for (const url of ['https://example.com', 'ws://user:pass@localhost', 'ws://localhost/?token=leak', 'ws://localhost/#leak', 'bad url']) {
      expect(resolveBridgeConnection(new URLSearchParams({ bridge: url }), hash)).toBeUndefined();
    }
  });
});

import { Bridge } from '../src/api/bridge.ts';
import type { WebNP2 } from '../src/api/webnp2.ts';
import type { SharedKeyInput } from '../src/api/shared-key-input.ts';
it('sends the pairing credential as a subprotocol and stops after a policy refusal', () => {
  vi.useFakeTimers();
  class Socket {
    static instances: Socket[] = [];
    listeners = new Map<string, ((event: unknown) => void)[]>();
    sent: string[] = [];
    constructor(public url: string, public protocols: string[]) { Socket.instances.push(this); }
    addEventListener(name: string, callback: (event: unknown) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]); }
    emit(name: string, event: unknown = {}) { for (const callback of this.listeners.get(name) ?? []) callback(event); }
    send(value: string) { this.sent.push(value); }
    close() { this.emit('close', { code: 1000 }); }
  }
  vi.stubGlobal('WebSocket', Socket);
  try {
    const bridge = new Bridge({} as WebNP2, {} as HTMLCanvasElement, {} as SharedKeyInput);
    bridge.connect('ws://127.0.0.1:3098/', token);
    const socket = Socket.instances[0];
    expect(socket.url).not.toContain(token);
    expect(socket.protocols).toEqual(['webnp2-bridge', `webnp2-token.${token}`]);
    socket.emit('open');
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'hello', role: 'webnp2' });
    socket.emit('close', { code: 1008 });
    vi.advanceTimersByTime(10000);
    expect(Socket.instances).toHaveLength(1);
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});
