const DEFAULTS = {
  memory: process.env.MEMORY_MCP_URL || 'http://127.0.0.1:8001/mcp',
  knowledge: process.env.KNOWLEDGE_MCP_URL || 'http://127.0.0.1:1933/mcp',
};

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function memoryMcpUrls() {
  return { ...DEFAULTS };
}

export async function probeMemoryServers(fetchImpl = globalThis.fetch) {
  const urls = memoryMcpUrls();
  const out = { memory: false, knowledge: false };
  if (typeof fetchImpl !== 'function') return out;
  for (const target of ['memory', 'knowledge']) {
    const origin = originOf(urls[target]);
    if (!origin) continue;
    try {
      const res = await fetchImpl(`${origin}/health`, { signal: AbortSignal.timeout(1500) });
      out[target] = Boolean(res?.ok);
    } catch {
      out[target] = false;
    }
  }
  return out;
}

function authHeader() {
  const key = String(process.env.KNOWLEDGE_MCP_AUTHORIZATION || '').trim();
  return key ? { Authorization: key.startsWith('Bearer ') ? key : `Bearer ${key}` } : {};
}

export async function mcpToolCall({ target, tool, args = {}, fetchImpl = globalThis.fetch } = {}) {
  const urls = memoryMcpUrls();
  const url = urls[target];
  if (!url || typeof fetchImpl !== 'function') return { ok: false };
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...authHeader(),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: tool, arguments: args },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res?.ok) return { ok: false };
    const text = await res.text();
    return { ok: true, text };
  } catch {
    return { ok: false };
  }
}

export function createMcpAdapters(fetchImpl = globalThis.fetch) {
  return {
    existsByKey: async (key) => {
      const memory = await mcpToolCall({ target: 'memory', tool: 'recall', args: { query: key }, fetchImpl });
      if (memory.ok && memory.text && memory.text.includes(key)) return true;
      const knowledge = await mcpToolCall({ target: 'knowledge', tool: 'search', args: { query: key }, fetchImpl });
      return Boolean(knowledge.ok && knowledge.text && knowledge.text.includes(key));
    },
    remember: async (record) => {
      const tool = 'remember';
      const result = await mcpToolCall({
        target: record.target || 'memory',
        tool,
        args: { data: record.content, text: record.content },
        fetchImpl,
      });
      return { ok: Boolean(result.ok) };
    },
    recall: async (key) => {
      const memory = await mcpToolCall({ target: 'memory', tool: 'recall', args: { query: key }, fetchImpl });
      if (memory.ok && memory.text && memory.text.includes(key)) return true;
      const knowledge = await mcpToolCall({ target: 'knowledge', tool: 'search', args: { query: key }, fetchImpl });
      return Boolean(knowledge.ok && knowledge.text && knowledge.text.includes(key));
    },
  };
}
