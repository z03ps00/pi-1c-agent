import fs from 'node:fs';
import path from 'node:path';
import { ensureProjectMcpConfig } from './project-init.mjs';

const ADD_VALUE = 'add';
const SERVER_PREFIX = 'server:';

export function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    out += ch;
  }
  return out;
}

export function parseMcpConfig(text) {
  const raw = JSON.parse(stripJsonComments(text));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('mcp.json must be an object');
  }
  const servers = raw.mcpServers;
  if (servers !== undefined && (!servers || typeof servers !== 'object' || Array.isArray(servers))) {
    throw new Error('mcpServers must be an object');
  }
  return { raw, servers: servers && typeof servers === 'object' ? servers : {} };
}

export function readMcpConfig(file) {
  if (!file || !fs.existsSync(file)) return { exists: false, raw: { mcpServers: {} }, servers: {} };
  const parsed = parseMcpConfig(fs.readFileSync(file, 'utf8'));
  return { exists: true, ...parsed };
}

export function formatMcpConfig(raw) {
  return `${JSON.stringify(raw, null, 2)}\n`;
}

export function writeMcpConfig(file, raw) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, formatMcpConfig(raw));
  fs.renameSync(tmp, file);
}

function cloneConfig(raw) {
  const next = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const servers = next.mcpServers && typeof next.mcpServers === 'object' && !Array.isArray(next.mcpServers)
    ? { ...next.mcpServers }
    : {};
  next.mcpServers = servers;
  return next;
}

export function addMcpServer(raw, name, url) {
  const key = String(name ?? '').trim();
  const target = String(url ?? '').trim();
  if (!key) throw new Error('server name is empty');
  if (!target) throw new Error('server url is empty');
  const next = cloneConfig(raw);
  const current = next.mcpServers[key];
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    next.mcpServers[key] = { ...current, url: target };
  } else {
    next.mcpServers[key] = {
      url: target,
      httpTransport: 'streamable-http',
      requestTimeoutMs: 120000,
    };
  }
  return next;
}

export function removeMcpServer(raw, name) {
  const key = String(name ?? '').trim();
  if (!key) throw new Error('server name is empty');
  const next = cloneConfig(raw);
  delete next.mcpServers[key];
  return next;
}

export function serverDescription(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '(нет url)';
  const url = typeof entry.url === 'string' ? entry.url : '';
  const command = typeof entry.command === 'string' ? entry.command : '';
  const where = url || command || '(нет url)';
  const headers = entry.headers;
  const auth = headers && typeof headers === 'object'
    ? (headers.Authorization || headers.authorization || '')
    : '';
  return auth ? `${where} · Authorization задан` : where;
}

export function serverChoices(servers = {}) {
  const items = Object.keys(servers).sort().map((name) => ({
    value: `${SERVER_PREFIX}${name}`,
    label: name,
    description: serverDescription(servers[name]),
  }));
  items.push({ value: ADD_VALUE, label: 'Добавить', description: 'имя и url нового сервера' });
  return items;
}

export function serverNameFromChoice(value) {
  const raw = String(value ?? '');
  if (!raw.startsWith(SERVER_PREFIX)) return '';
  return raw.slice(SERVER_PREFIX.length);
}

export function parseMcpconfigArgs(args) {
  const raw = String(args ?? '').trim().toLowerCase();
  if (!raw) return { kind: 'pick' };
  if (raw === 'local' || raw === 'project') return { kind: 'scope', scope: 'local' };
  if (raw === 'global' || raw === 'profile') return { kind: 'scope', scope: 'global' };
  return { kind: 'invalid' };
}

export function resolveMcpConfigPath(scope, { cwd, env = process.env } = {}) {
  if (scope === 'local') {
    const ensured = ensureProjectMcpConfig(cwd);
    return { scope: 'local', file: ensured.absolute, created: ensured.created, missing: false };
  }
  if (scope === 'global') {
    const root = String(env.PI_CODING_AGENT_DIR || '').trim();
    const file = root ? path.join(root, 'mcp.json') : '';
    return { scope: 'global', file, created: false, missing: !file || !fs.existsSync(file) };
  }
  return null;
}
