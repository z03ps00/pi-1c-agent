import fs from 'node:fs';
import path from 'node:path';
import { redact } from './redact.mjs';

function emptyDistill() {
  return {
    task: '',
    artifacts: [],
    findings: [],
    public_surface: [],
    locked_decisions: [],
    constraints: [],
    unresolved: [],
    verification: [],
    tools: [],
    files: [],
    fallback: false,
  };
}

export const DISTILL_SYSTEM_PROMPT = [
  'You distill a coding-agent session into durable memory.',
  'Return ONLY JSON with these keys:',
  '- task: string (one-line objective)',
  '- locked_decisions: string[] (decisions and rationale)',
  '- files: string[] (files or objects changed)',
  '- unresolved: string[] (unresolved work and next steps)',
  '- verification: string[] (only explicit verification items)',
  '- findings: string[]',
  '- constraints: string[]',
  '- artifacts: string[]',
  '- public_surface: string[]',
  '- tools: string[]',
  'No markdown, no commentary. Use empty arrays when unknown.',
].join('\n');

const LIST_KEYS = [
  'locked_decisions',
  'files',
  'unresolved',
  'verification',
  'findings',
  'constraints',
  'artifacts',
  'public_surface',
  'tools',
];

const ENV_KEYS = [
  'ROUTERAI_API_KEY',
  'ROUTERAI_ENDPOINT',
  'ROUTERAI_MODEL',
  'MEMORY_OLLAMA_HOST',
  'MEMORY_OLLAMA_PORT',
  'OLLAMA_LLM_MODEL',
];

function readEnvFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return {};
    const out = {};
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadStackEnv({ profileDir, env } = {}) {
  const merged = {};
  const roots = [profileDir, process.env.PI_CODING_AGENT_DIR].filter(Boolean);
  for (const root of roots) {
    Object.assign(merged, readEnvFile(path.join(root, 'mcp.optional', 'memory-stack', 'defaults.env')));
    Object.assign(merged, readEnvFile(path.join(root, 'mcp.optional', 'memory-stack', 'secrets', 'routerai.env')));
  }
  for (const key of ENV_KEYS) {
    if (process.env[key]) merged[key] = process.env[key];
  }
  if (env && typeof env === 'object') {
    for (const key of ENV_KEYS) {
      if (Object.prototype.hasOwnProperty.call(env, key)) merged[key] = env[key];
    }
  }
  return merged;
}

export function resolveStackProvider({ mode = 'stack', model = '', profileDir, env } = {}) {
  const cfg = loadStackEnv({ profileDir, env });
  const named = String(model || '').trim();
  const want = String(mode || 'stack').toLowerCase();
  const routerKey = String(cfg.ROUTERAI_API_KEY || '').trim();
  const routerEndpoint = String(cfg.ROUTERAI_ENDPOINT || 'https://routerai.ru/api/v1').replace(/\/$/, '');
  const routerModel = named || String(cfg.ROUTERAI_MODEL || 'qwen/qwen3.5-9b');
  const ollamaHost = String(cfg.MEMORY_OLLAMA_HOST || '127.0.0.1');
  const ollamaPort = String(cfg.MEMORY_OLLAMA_PORT || '11434');
  const ollamaModel = named || String(cfg.OLLAMA_LLM_MODEL || 'qwen3.5:9b');

  if (want === 'routerai') {
    if (!routerKey) return null;
    return { kind: 'routerai', endpoint: `${routerEndpoint}/chat/completions`, model: routerModel, apiKey: routerKey };
  }
  if (want === 'ollama') {
    return { kind: 'ollama', endpoint: `http://${ollamaHost}:${ollamaPort}/v1/chat/completions`, model: ollamaModel, apiKey: '' };
  }
  if (routerKey) {
    return { kind: 'routerai', endpoint: `${routerEndpoint}/chat/completions`, model: routerModel, apiKey: routerKey };
  }
  // stack without RouterAI: try local Ollama rather than silent heuristic.
  return { kind: 'ollama', endpoint: `http://${ollamaHost}:${ollamaPort}/v1/chat/completions`, model: ollamaModel, apiKey: '' };
}

export function parseDistillPayload(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1].trim() : raw;
  if (!candidate.startsWith('{')) {
    const braced = candidate.match(/\{[\s\S]*\}/);
    if (!braced) return null;
    candidate = braced[0];
  }
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out = emptyDistill();
  if (parsed.task) out.task = String(parsed.task).trim().slice(0, 200);
  for (const key of LIST_KEYS) {
    if (!Array.isArray(parsed[key])) continue;
    out[key] = parsed[key].map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  return out;
}

export function distillPromptEntries(entries = []) {
  const lines = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const role = entry?.role || entry?.type || '';
    const tool = entry?.tool || entry?.name || '';
    const file = entry?.input?.path || entry?.input?.file || '';
    const content = String(entry?.content || entry?.text || '').slice(0, 500);
    const row = [role, tool && `tool=${tool}`, file && `file=${file}`, content].filter(Boolean).join(' | ');
    if (row) lines.push(row);
  }
  return redact(lines.join('\n').slice(0, 12000)).text;
}

function isUsefulDistill(distilled) {
  if (!distilled) return false;
  if (String(distilled.task || '').trim()) return true;
  return LIST_KEYS.some((key) => Array.isArray(distilled[key]) && distilled[key].length > 0);
}

async function callChatCompletions({ endpoint, apiKey, model, messages, fetchImpl, timeoutMs }) {
  if (typeof fetchImpl !== 'function') throw new Error('stack provider unreachable');
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res?.ok) throw new Error('stack provider unreachable');
  const body = typeof res.json === 'function' ? await res.json() : JSON.parse(await res.text());
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error('stack provider empty');
  return String(text);
}

export async function distillWithProvider({
  mode = 'stack',
  model = '',
  entries = [],
  fetchImpl = globalThis.fetch,
  env,
  profileDir,
  timeoutMs = 30000,
} = {}) {
  const provider = resolveStackProvider({ mode, model, profileDir, env });
  if (!provider) return null;
  const user = distillPromptEntries(entries);
  const text = await callChatCompletions({
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: provider.model,
    messages: [
      { role: 'system', content: DISTILL_SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    fetchImpl,
    timeoutMs,
  });
  const parsed = parseDistillPayload(text);
  if (!isUsefulDistill(parsed)) return null;
  parsed.fallback = false;
  return parsed;
}
