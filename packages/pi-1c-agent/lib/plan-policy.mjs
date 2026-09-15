import fs from 'node:fs';
import path from 'node:path';
import { anonMutatorFallbackRegex, isMemoryMutator } from './memory-mutators.mjs';

export const PLAN_WRITABLE_ROOTS = [
  'openspec',
  path.join('.pi', '1c', 'plans'),
  path.join('.pi', '1c', 'knowledge-drafts'),
];

const EXACT_READ_ONLY = new Set([
  'read','grep','find','ls','questionnaire','subagent_1c',
  'templatesearch','codesearch','search_function','get_module_structure',
  'metadatasearch','get_metadata_details','bsl_scope_members','docsearch','ssl_search',
  'syntaxcheck','check_1c_code','review_1c_code','graph_dependencies','knowledge_1c',
  'get_method_call_hierarchy','trace_impact',
]);

const READ_ONLY_PATTERNS = [
  /(^|[_-])(read|get|list|find|grep|search|lookup|inspect|describe|show|query|review|check|validate|analy[sz]e|trace)([_-]|$)/i,
  /(^|[_-])(docs?|metadata|schema|dependencies|hierarchy|scope)([_-]|$)/i,
];

const PLAN_MCP_READ_ONLY_TOOLS = Object.freeze({
  knowledge: new Set(['find', 'glob', 'grep', 'health', 'list', 'list_watches', 'read', 'search', 'tree']),
  memory: new Set(['recall', 'search_tools']),
});

const RECALL_MCP_READ_ONLY_TOOLS = Object.freeze({
  knowledge: new Set(['find', 'glob', 'grep', 'list', 'read', 'search', 'tree']),
  memory: new Set(['recall']),
});

const RECALL_TOOL_NAMES = new Set([
  ...RECALL_MCP_READ_ONLY_TOOLS.knowledge,
  ...RECALL_MCP_READ_ONLY_TOOLS.memory,
]);

export const ANON_SHARED_MEMORY_SERVERS = Object.freeze(['memory', 'knowledge']);
export const ANON_HANDOFF_RELATIVE_ROOTS = Object.freeze([
  'handoffs',
  path.join('.pi', '1c', 'handoffs'),
]);

export const ANON_MEMORY_READ_TOOLS = new Set(['recall', 'search_tools', 'health', 'get', 'list', 'status']);
export const ANON_KNOWLEDGE_READ_TOOLS = new Set(['find', 'search', 'read', 'list', 'list_watches', 'tree', 'grep', 'glob', 'health']);
const ANON_ALWAYS_ALLOWED_TOOLS = new Set(['health']);
const ANON_MUTATOR_FALLBACK_RE = anonMutatorFallbackRegex();

export function isPlanReadOnlyToolName(name) {
  if (EXACT_READ_ONLY.has(name)) return true;
  if (name === 'write' || name === 'edit' || name === 'bash') return false;
  return READ_ONLY_PATTERNS.some((re) => re.test(name));
}

export function getPlanVisibleTools(activeTools, allTools) {
  const available = new Set(allTools);
  const active = new Set(activeTools);
  const out = [];
  for (const name of activeTools) {
    if (available.has(name) && isPlanReadOnlyToolName(name)) out.push(name);
  }
  // Scoped planning writes are guarded at tool_call time.
  for (const name of ['write', 'edit', 'subagent_1c']) {
    if (available.has(name) && !out.includes(name)) out.push(name);
  }
  // mcp is the lazy proxy; name does not match read-only patterns, but PLAN
  // already allows recall/search via evaluatePlanMcpToolCall.
  if (available.has('mcp') && active.has('mcp') && !out.includes('mcp')) out.push('mcp');
  return [...new Set(out)];
}

export function getReadOnlyVisibleTools(mode, activeTools, allTools) {
  const base = getPlanVisibleTools(activeTools, allTools);
  if (mode === 'ask') return base.filter((name) => name !== 'write' && name !== 'edit');
  return base;
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function rejectSymlinkSegments(base, target) {
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  let cur = base;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    cur = path.join(cur, part);
    if (!fs.existsSync(cur)) continue;
    const stat = fs.lstatSync(cur);
    if (stat.isSymbolicLink()) return false;
  }
  return true;
}

export function resolvePlanningWrite(cwd, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return { allowed: false, reason: 'missing target path' };
  }
  const base = path.resolve(cwd);
  const target = path.resolve(base, candidate);
  const roots = PLAN_WRITABLE_ROOTS.map((r) => path.resolve(base, r));
  const root = roots.find((r) => isWithin(r, target));
  if (!root) {
    return { allowed: false, reason: `target is outside PLAN writable roots: ${PLAN_WRITABLE_ROOTS.join(', ')}` };
  }
  if (!rejectSymlinkSegments(base, target)) {
    return { allowed: false, reason: 'symlink traversal is not allowed in PLAN writes' };
  }
  return { allowed: true, target, root };
}

export function extractToolTarget(input = {}) {
  for (const key of ['path', 'file_path', 'filePath', 'target', 'filename']) {
    if (typeof input?.[key] === 'string' && input[key].trim()) return input[key];
  }
  return undefined;
}

export function extractAllToolTargets(input = {}) {
  const out = [];
  const pushValue = (v) => {
    if (typeof v === 'string' && v.trim()) out.push(v);
  };
  const walk = (node, depth = 0) => {
    if (!node || depth > 4) return;
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (/^(path|file_path|filePath|target|filename|file|dest|destination|output|new_path|source|src)$/i.test(key)) {
        pushValue(value);
      } else if (value && typeof value === 'object') {
        walk(value, depth + 1);
      }
    }
  };
  walk(input);
  return [...new Set(out)];
}

function normalizeMcpToolName(serverName, toolName) {
  const tool = String(toolName ?? '').trim();
  if (serverName && tool.startsWith(`${serverName}_`)) return tool.slice(serverName.length + 1);
  return tool;
}

export function evaluatePlanMcpToolCall(serverName, originalToolName) {
  const tool = normalizeMcpToolName(serverName, originalToolName);
  const allowed = PLAN_MCP_READ_ONLY_TOOLS[serverName]?.has(tool) ?? false;
  return allowed
    ? { allowed: true, reason: 'read-only MCP tool' }
    : { allowed: false, reason: `MCP mutation or unknown tool '${serverName}.${originalToolName}'` };
}

// Independent PLAN guard for the MCP gateway tool and per-server proxies
// (mcp / mcp__<server>). The adapter approval event is defence-in-depth; this
// check must stand on its own when the adapter is absent.
export function evaluatePlanMcpProxyCall(input = {}, forcedServer) {
  if (input && typeof input === 'object' && input.action) {
    return { allowed: false, reason: 'MCP authentication/UI actions are disabled in PLAN mode' };
  }
  const tool = typeof input?.tool === 'string' ? input.tool.trim() : '';
  if (!tool) return { allowed: true, reason: 'read-only MCP status/search' };
  const server = forcedServer || (typeof input?.server === 'string' ? input.server.trim() : '');
  if (server) return evaluatePlanMcpToolCall(server, tool);
  const matches = Object.entries(PLAN_MCP_READ_ONLY_TOOLS)
    .filter(([, set]) => set.has(normalizeMcpToolName(undefined, tool)));
  if (matches.length > 0) return { allowed: true, reason: 'read-only MCP tool' };
  return { allowed: false, reason: `MCP mutation or unknown tool '${tool}'` };
}

export function evaluatePlanToolCall(cwd, toolName, input = {}) {
  if (toolName === 'bash') {
    return { allowed: false, reason: 'shell execution is disabled in PLAN mode' };
  }
  if (toolName === 'write' || toolName === 'edit') {
    const target = extractToolTarget(input);
    const result = resolvePlanningWrite(cwd, target);
    return result.allowed
      ? { allowed: true, planningWrite: true, target: result.target }
      : { allowed: false, reason: result.reason };
  }
  if (toolName === 'mcpScript') {
    return { allowed: false, reason: 'mcpScript is disabled in PLAN mode' };
  }
  if (toolName === 'mcp') {
    return evaluatePlanMcpProxyCall(input);
  }
  if (typeof toolName === 'string' && toolName.startsWith('mcp__')) {
    return evaluatePlanMcpProxyCall(input, toolName.slice('mcp__'.length));
  }
  if (isPlanReadOnlyToolName(toolName)) return { allowed: true, planningWrite: false };
  return { allowed: false, reason: `tool '${toolName}' is not declared read-only for PLAN mode` };
}

export function evaluateReadOnlyToolCall(mode, cwd, toolName, input = {}) {
  if (toolName === 'bash') {
    return { allowed: false, reason: `shell execution is disabled in ${String(mode).toUpperCase()} mode` };
  }
  if (mode === 'ask' && (toolName === 'write' || toolName === 'edit')) {
    return { allowed: false, reason: 'ASK is read-only research; file writes are disabled' };
  }
  return evaluatePlanToolCall(cwd, toolName, input);
}

export function isRecallMcpCall(toolName, input = {}) {
  if (typeof toolName !== 'string') return false;
  if (toolName === 'mcp') {
    if (!input || typeof input !== 'object') return false;
    const tool = typeof input.tool === 'string' ? input.tool.trim() : '';
    if (!tool) return false;
    const server = typeof input.server === 'string' ? input.server.trim() : '';
    if (!server) return RECALL_TOOL_NAMES.has(tool);
    return RECALL_MCP_READ_ONLY_TOOLS[server]?.has(normalizeMcpToolName(server, tool)) ?? false;
  }
  if (toolName.startsWith('mcp__')) {
    const rest = toolName.slice('mcp__'.length);
    const sep = rest.indexOf('__');
    if (sep <= 0) return false;
    const server = rest.slice(0, sep);
    const tool = normalizeMcpToolName(server, rest.slice(sep + 2));
    return RECALL_MCP_READ_ONLY_TOOLS[server]?.has(tool) ?? false;
  }
  return false;
}

function inferSharedMemoryServer(toolName) {
  const t = String(toolName ?? '').trim();
  for (const server of ANON_SHARED_MEMORY_SERVERS) {
    if (t === server || t.startsWith(`${server}_`)) return server;
  }
  return '';
}

export function describeMcpCall(toolName, input = {}) {
  if (typeof toolName !== 'string') return null;
  if (toolName === 'mcp') {
    const raw = typeof input?.tool === 'string' ? input.tool.trim() : '';
    if (!raw) return null;
    const explicit = typeof input?.server === 'string' ? input.server.trim() : '';
    if (explicit) return { server: explicit, tool: normalizeMcpToolName(explicit, raw) };
    const inferred = inferSharedMemoryServer(raw);
    return { server: inferred, tool: inferred ? normalizeMcpToolName(inferred, raw) : raw };
  }
  if (toolName.startsWith('mcp__')) {
    const rest = toolName.slice('mcp__'.length);
    const sep = rest.indexOf('__');
    if (sep > 0) {
      const server = rest.slice(0, sep);
      return { server, tool: normalizeMcpToolName(server, rest.slice(sep + 2)) };
    }
    const nested = typeof input?.tool === 'string' ? input.tool.trim() : '';
    return { server: rest, tool: normalizeMcpToolName(rest, nested) };
  }
  const inferred = inferSharedMemoryServer(toolName);
  if (inferred) return { server: inferred, tool: normalizeMcpToolName(inferred, toolName) };
  return null;
}

function isSharedMemoryServer(serverName) {
  return ANON_SHARED_MEMORY_SERVERS.includes(String(serverName ?? '').trim());
}

export function evaluateAnonMcpCall(level, serverName, originalToolName) {
  const lvl = Math.trunc(Number(level)) || 0;
  if (lvl <= 0) return { allowed: true, reason: 'anonymous mode off' };
  const server = String(serverName ?? '').trim();
  if (!isSharedMemoryServer(server)) return { allowed: true, reason: 'not a shared-memory server' };
  const tool = normalizeMcpToolName(server, originalToolName);
  if (isMemoryMutator(server, tool) || isMemoryMutator(server, originalToolName)) {
    return { allowed: false, reason: `anonymous session (anon:${lvl}) forbids writing to '${server}.${originalToolName}'` };
  }
  if (ANON_ALWAYS_ALLOWED_TOOLS.has(tool)) return { allowed: true, reason: 'liveness check only' };
  const readTools = server === 'memory' ? ANON_MEMORY_READ_TOOLS : ANON_KNOWLEDGE_READ_TOOLS;
  if (!readTools.has(tool)) {
    return { allowed: false, reason: `anonymous session (anon:${lvl}) forbids writing to '${server}.${originalToolName}'` };
  }
  if (lvl >= 2) {
    return { allowed: false, reason: `anonymous session (anon:${lvl}) forbids reading from '${server}.${originalToolName}'` };
  }
  return { allowed: true, reason: 'anon:1 keeps shared-memory reads' };
}

export function resolveAnonPendingRoot() {
  const env = String(process.env.PI_CODING_AGENT_DIR ?? '').trim();
  if (env) return path.resolve(env, 'state', 'agent-memory', 'pending');
  const home = String(process.env.HOME || process.env.USERPROFILE || '').trim();
  if (home) return path.resolve(home, '.local', 'state', 'agent-memory', 'pending');
  return path.resolve('state', 'agent-memory', 'pending');
}

export function resolveAnonHandoffRoots(cwd = process.cwd()) {
  return ANON_HANDOFF_RELATIVE_ROOTS.map((rel) => path.resolve(cwd, rel));
}

function anonPathCandidates(input = {}) {
  const out = [...extractAllToolTargets(input)];
  for (const key of ['command', 'cmd', 'script', 'content']) {
    if (typeof input?.[key] === 'string' && input[key].trim()) out.push(input[key]);
  }
  return out;
}

function mentionsRoot(candidate, root, cwd) {
  const value = String(candidate ?? '');
  if (!value) return false;
  const resolvedRoot = path.resolve(root);
  if (value.includes(resolvedRoot) || value.includes(root)) return true;
  try {
    const resolved = path.resolve(value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) ? value : path.join(cwd, value));
    return isWithin(resolvedRoot, resolved);
  } catch {
    return false;
  }
}

export function evaluateAnonWriteCall(level, toolName, input = {}, cwd = process.cwd()) {
  const lvl = Math.trunc(Number(level)) || 0;
  if (lvl <= 0) return { allowed: true, reason: 'anonymous mode off' };
  if (toolName !== 'write' && toolName !== 'edit' && toolName !== 'bash') {
    return { allowed: true, reason: 'not a file-writing tool' };
  }
  const pendingRoot = resolveAnonPendingRoot();
  const handoffRoots = resolveAnonHandoffRoots(cwd);
  for (const candidate of anonPathCandidates(input)) {
    if (mentionsRoot(candidate, pendingRoot, cwd)) {
      return { allowed: false, reason: 'anonymous session forbids pending-memory records' };
    }
    if (lvl >= 3 && handoffRoots.some((root) => mentionsRoot(candidate, root, cwd))) {
      return { allowed: false, reason: 'anonymous level 3 forbids handoff documents' };
    }
  }
  return { allowed: true, reason: 'target holds no anonymous-session trace' };
}

export function libCall(fn, args = []) {
  try {
    if (typeof fn !== 'function') return undefined;
    return fn(...args);
  } catch {
    return undefined;
  }
}

export function fallbackAnonVerdict(level, input) {
  const lvl = Math.trunc(Number(level)) || 0;
  if (lvl <= 0) return { allowed: true, reason: 'anonymous mode off' };
  let blob = '';
  try {
    blob = JSON.stringify(input ?? {});
  } catch {
    blob = String(input ?? '');
  }
  if (lvl >= 1 && /agent-memory[/\\]pending/.test(blob)) {
    return { allowed: false, reason: 'anonymous session forbids pending-memory records (stale lib fallback)' };
  }
  if (lvl >= 3 && /handoffs[/\\]/.test(blob)) {
    return { allowed: false, reason: 'anonymous level 3 forbids handoff documents (stale lib fallback)' };
  }
  if (lvl >= 1 && ANON_MUTATOR_FALLBACK_RE.test(blob)) {
    return { allowed: false, reason: 'anonymous session forbids shared-memory writes (stale lib fallback)' };
  }
  if (lvl >= 2 && /knowledge_(find|search|read|list|tree|grep|glob)|memory_recall|memory_search_tools/.test(blob)) {
    return { allowed: false, reason: 'anonymous session forbids shared-memory reads (stale lib fallback)' };
  }
  return { allowed: true, reason: 'no shared-memory trace detected (stale lib fallback)' };
}
