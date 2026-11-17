/** Resolve an explicit bridge opt-in without putting its capability in a query/referrer. */
export function resolveBridgeConnection(params: URLSearchParams, hash: string): {url: string; token: string} | undefined {
  const raw = params.get('bridge');
  if (raw === null) return undefined;
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('bridge-token');
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    console.error('[WebNP2 bridge] Open the private pairing URL printed by the MCP server.');
    return undefined;
  }
  const url = raw === '1' || raw === '' ? 'ws://127.0.0.1:3098' : /^\d+$/.test(raw) ? `ws://127.0.0.1:${raw}` : raw;
  try {
    const parsed = new URL(url);
    if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || parsed.search) return undefined;
    return { url: parsed.href, token };
  } catch { return undefined; }
}
