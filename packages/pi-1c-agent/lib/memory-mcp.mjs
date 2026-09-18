import { sessionCaptureDocumentUri } from './memory-write.mjs';

const DEFAULTS = {
  memory: process.env.MEMORY_MCP_URL || 'http://127.0.0.1:8001/mcp',
  knowledge: process.env.KNOWLEDGE_MCP_URL || 'http://127.0.0.1:1933/mcp',
};

export const MCP_READ_TIMEOUT_MS = 8000;
export const MCP_MUTATE_TIMEOUT_MS = 30000;

const MUTATE_TOOLS = new Set(['remember', 'write', 'add_resource', 'edit', 'forget']);
const sessions = new Map();
const initPromises = new Map();
const recoveryPromises = new Map();
let rpcId = 1;
let initCount = 0;
let resetCount = 0;

function nextRpcId() {
  rpcId += 1;
  return rpcId;
}

function cogneeDataset() {
  return String(process.env.COGNEE_DATASET || 'main_dataset').trim() || 'main_dataset';
}

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

export function knowledgeDocumentUri(record) {
  if (record?.uri) return String(record.uri);
  const project = String(record?.scope || '').replace(/^project:/i, '');
  const rawTask = String(record?.session_id || record?.task || 'session');
  const session = rawTask.replace(/^session-(transcript-)?/i, '') || 'session';
  return sessionCaptureDocumentUri(project, session);
}

export function parseMcpResponse(raw) {
  const source = String(raw ?? '');
  const payloads = [];
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(/^data:\s*(.+)$/);
    if (!m) continue;
    try {
      payloads.push(JSON.parse(m[1]));
    } catch {
      // keep scanning
    }
  }
  if (payloads.length === 0) {
    try {
      payloads.push(JSON.parse(source));
    } catch {
      // raw text
    }
  }
  let text = source;
  let isError = false;
  for (const msg of payloads) {
    if (msg?.error) isError = true;
    if (msg?.result?.isError) isError = true;
    const parts = msg?.result?.content;
    if (Array.isArray(parts)) {
      text = parts.map((part) => String(part?.text ?? '')).filter(Boolean).join('\n');
    }
  }
  const missing = /file not found/i.test(text);
  return { text, isError, missing, ok: !isError && !missing && Boolean(text) };
}

function mcpHeaders(sessionId) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...authHeader(),
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  return headers;
}

async function postMcp(url, payload, fetchImpl, timeoutMs, sessionId) {
  return fetchImpl(url, {
    method: 'POST',
    headers: mcpHeaders(sessionId),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function initializeMcpSession(url, fetchImpl, timeoutMs) {
  const res = await postMcp(url, {
    jsonrpc: '2.0',
    id: nextRpcId(),
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'pi-1c-agent', version: '0.6.1' },
    },
  }, fetchImpl, timeoutMs);
  if (!res?.ok) return '';
  const sessionId = res.headers?.get?.('mcp-session-id') || res.headers?.get?.('Mcp-Session-Id') || '';
  try {
    await res.text();
  } catch {
    // ignore
  }
  if (sessionId) {
    sessions.set(url, sessionId);
    initCount += 1;
  }
  try {
    const notified = await postMcp(url, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }, fetchImpl, timeoutMs, sessionId);
    try {
      await notified?.text?.();
    } catch {
      // ignore
    }
  } catch {
    // notification is best-effort
  }
  return sessionId || '';
}

export function invalidateSession(url, observedSessionId) {
  if (sessions.get(url) === observedSessionId) {
    sessions.delete(url);
    resetCount += 1;
    return true;
  }
  return false;
}

export function mcpSessionStats() {
  return { initCount, resetCount, active: sessions.size };
}

export async function recoverMcpSession(url, observedSessionId, fetchImpl, timeoutMs) {
  invalidateSession(url, observedSessionId);
  let pending = recoveryPromises.get(url);
  if (!pending) {
    pending = initializeMcpSession(url, fetchImpl, timeoutMs)
      .finally(() => recoveryPromises.delete(url));
    recoveryPromises.set(url, pending);
  }
  return pending;
}

export async function ensureMcpSession(url, fetchImpl, timeoutMs) {
  if (sessions.has(url)) return sessions.get(url);
  let pending = initPromises.get(url) || recoveryPromises.get(url);
  if (!pending) {
    pending = initializeMcpSession(url, fetchImpl, timeoutMs)
      .finally(() => initPromises.delete(url));
    initPromises.set(url, pending);
  }
  return pending;
}

export function resetMcpSessionsForTests() {
  sessions.clear();
  initPromises.clear();
  recoveryPromises.clear();
  rpcId = 1;
  initCount = 0;
  resetCount = 0;
}

export async function mcpToolCall({
  target,
  tool,
  args = {},
  fetchImpl = globalThis.fetch,
  timeoutMs,
} = {}) {
  const urls = memoryMcpUrls();
  const url = urls[target];
  if (!url || typeof fetchImpl !== 'function') return { ok: false };
  const ms = timeoutMs ?? (MUTATE_TOOLS.has(tool) ? MCP_MUTATE_TIMEOUT_MS : MCP_READ_TIMEOUT_MS);
  const payload = {
    jsonrpc: '2.0',
    id: nextRpcId(),
    method: 'tools/call',
    params: { name: tool, arguments: args },
  };
  try {
    let sessionId = await ensureMcpSession(url, fetchImpl, Math.min(ms, 8000));
    let res = await postMcp(url, payload, fetchImpl, ms, sessionId);
    if (!res?.ok) {
      sessionId = await recoverMcpSession(url, sessionId, fetchImpl, Math.min(ms, 8000));
      res = await postMcp(url, payload, fetchImpl, ms, sessionId);
    }
    if (!res?.ok) return { ok: false };
    const raw = await res.text();
    const parsed = parseMcpResponse(raw);
    return { ok: parsed.ok, text: parsed.text, raw };
  } catch {
    return { ok: false };
  }
}

function recordKey(keyOrRecord) {
  return typeof keyOrRecord === 'string' ? keyOrRecord : String(keyOrRecord?.idempotency_key || '');
}

function isKnowledgeRecord(keyOrRecord) {
  if (typeof keyOrRecord !== 'object' || !keyOrRecord) return false;
  return keyOrRecord.target === 'knowledge' || Boolean(keyOrRecord.uri);
}

async function verifyKnowledge(keyOrRecord, fetchImpl) {
  const key = recordKey(keyOrRecord);
  const uri = typeof keyOrRecord === 'object' ? knowledgeDocumentUri(keyOrRecord) : '';
  if (uri) {
    const read = await mcpToolCall({
      target: 'knowledge',
      tool: 'read',
      args: { uris: [uri] },
      fetchImpl,
    });
    if (read.ok && read.text && (key ? read.text.includes(key) : /## Session capture/i.test(read.text))) {
      return true;
    }
  }
  const query = key || uri;
  if (!query) return false;
  const search = await mcpToolCall({
    target: 'knowledge',
    tool: 'search',
    args: { query },
    fetchImpl,
  });
  return Boolean(search.ok && search.text && key && search.text.includes(key));
}

export function createMcpAdapters(fetchImpl = globalThis.fetch) {
  const recallImpl = async (keyOrRecord) => {
    if (isKnowledgeRecord(keyOrRecord)) return verifyKnowledge(keyOrRecord, fetchImpl);
    const key = recordKey(keyOrRecord);
    const correlationId = typeof keyOrRecord === 'object' ? String(keyOrRecord.correlation_id || '') : '';
    const query = correlationId || key;
    if (!query) return false;
    const memory = await mcpToolCall({
      target: 'memory',
      tool: 'recall',
      args: { query, search_type: 'CHUNKS', datasets: cogneeDataset() },
      fetchImpl,
    });
    const hay = memory.text || '';
    if (!memory.ok || !hay) return false;
    if (correlationId && hay.includes(correlationId)) return true;
    if (key && hay.includes(key)) return true;
    return false;
  };

  return {
    existsByKey: recallImpl,
    remember: async (record) => {
      const target = record.target || 'memory';
      if (target === 'knowledge') {
        const uri = knowledgeDocumentUri(record);
        const result = await mcpToolCall({
          target: 'knowledge',
          tool: 'write',
          args: { uri, content: record.content, mode: 'replace', wait: true },
          fetchImpl,
        });
        return { ok: Boolean(result.ok) };
      }
      const result = await mcpToolCall({
        target: 'memory',
        tool: 'remember',
        args: { data: record.content, dataset_name: cogneeDataset() },
        fetchImpl,
      });
      return { ok: Boolean(result.ok) };
    },
    recall: recallImpl,
  };
}
