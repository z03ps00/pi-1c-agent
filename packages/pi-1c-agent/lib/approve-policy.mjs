import { DOCKER_COMMAND_RE } from './docker-policy.mjs';
import {
  ANON_SHARED_MEMORY_SERVERS,
  describeMcpCall,
  evaluatePlanMcpToolCall,
  extractToolTarget,
  isPlanReadOnlyToolName,
} from './plan-policy.mjs';

export const APPROVE_MAX_LEVEL = 2;
export const APPROVE_LEVEL_NAMES = Object.freeze(['off', 'safe', 'strict']);

const IB_MUTATING_NAMES = new Set([
  'vcexecutecode',
  'vcexecutequery',
  'executecode',
  'executequery',
  'execute_code',
  'execute_query',
  'execute-code',
  'execute-query',
]);

const RM_RF_RE = /(^|[\n;&|`])\s*(?:sudo\s+)?(?:env\s+)?rm\s+(?:-[^\s]+\s+)*-(?:[^\s]*r[^\s]*f|[^\s]*f[^\s]*r)\b/i;
const GIT_PUSH_RE = /(^|[\n;&|`])\s*(?:sudo\s+)?git\s+push\b/i;
const GIT_RESET_HARD_RE = /(^|[\n;&|`])\s*(?:sudo\s+)?git\s+reset\s+--hard\b/i;
const GIT_CLEAN_FD_RE = /(^|[\n;&|`])\s*(?:sudo\s+)?git\s+clean\s+-[^\s]*f[^\s]*d/i;
const GIT_CHECKOUT_DISCARD_RE = /(^|[\n;&|`])\s*(?:sudo\s+)?git\s+checkout\s+--(?=\s|$)/i;
const CONFIG_LOAD_RE = /\.(dt|cf|cfe)\b/i;
const LOAD_INFOBASE_RE = /ЗагрузитьИнформационнуюБазу/i;
const PUBLISH_RE = /публикац/i;

function compactToolName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/[-_]/g, '');
}

export function isIbMutatingName(name) {
  const raw = String(name ?? '').trim().toLowerCase();
  if (!raw) return false;
  if (IB_MUTATING_NAMES.has(raw)) return true;
  return IB_MUTATING_NAMES.has(compactToolName(raw));
}

export function approveLevelName(level) {
  const lvl = normalizeApproveLevel(level);
  return APPROVE_LEVEL_NAMES[lvl] ?? 'off';
}

export function describeApprove(level) {
  const name = approveLevelName(level);
  if (name === 'safe') return 'ask before dangerous actions (writes, destructive bash, MCP/IB mutations)';
  if (name === 'strict') return 'approve every tool call';
  return 'do not ask — current BUILD behaviour';
}

export function normalizeApproveLevel(value) {
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (t === 'off' || t === 'no' || t === 'false') return 0;
    if (t === 'safe' || t === 'on' || t === 'yes' || t === 'true') return 1;
    if (t === 'strict') return 2;
  }
  const raw = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(raw)) return 0;
  const level = Math.trunc(raw);
  return level >= 1 && level <= APPROVE_MAX_LEVEL ? level : 0;
}

/** Parses a `/approve` argument: { kind: 'status' | 'pick' | 'set' | 'invalid', level? }. */
export function parseApproveLevel(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  if (t === 'off' || t === '0' || t === 'no' || t === 'false') return { kind: 'set', level: 0 };
  if (t === 'safe' || t === '1' || t === 'on' || t === 'yes' || t === 'true') return { kind: 'set', level: 1 };
  if (t === 'strict' || t === '2') return { kind: 'set', level: 2 };
  return { kind: 'invalid' };
}

/** Hotkey cycle: off → safe → strict → off. */
export function cycleApproveLevel(level) {
  const current = normalizeApproveLevel(level);
  return current >= APPROVE_MAX_LEVEL ? 0 : current + 1;
}

export function shouldPrompt(level, dangerous) {
  const lvl = normalizeApproveLevel(level);
  if (lvl >= 2) return true;
  if (lvl === 1) return Boolean(dangerous);
  return false;
}

export function dangerousBashReason(command) {
  const text = typeof command === 'string' ? command : '';
  if (!text.trim()) return null;
  if (DOCKER_COMMAND_RE.test(text)) return 'docker/podman/mcp-ctl command';
  if (RM_RF_RE.test(text)) return 'rm -rf';
  if (GIT_PUSH_RE.test(text)) return 'git push';
  if (GIT_RESET_HARD_RE.test(text)) return 'git reset --hard';
  if (GIT_CLEAN_FD_RE.test(text)) return 'git clean -fd';
  if (GIT_CHECKOUT_DISCARD_RE.test(text)) return 'git checkout --';
  if (CONFIG_LOAD_RE.test(text)) return 'infobase/config load (.dt/.cf/.cfe)';
  if (LOAD_INFOBASE_RE.test(text)) return 'ЗагрузитьИнформационнуюБазу';
  if (PUBLISH_RE.test(text)) return 'publication command';
  return null;
}

function classifyMcp(toolName, input) {
  const call = describeMcpCall(toolName, input);
  if (!call) {
    if (toolName === 'mcpScript') {
      return { dangerous: true, category: 'mcp_mutation', reason: 'mcpScript can run arbitrary MCP actions' };
    }
    if (toolName === 'mcp') {
      if (input && typeof input === 'object' && input.action) {
        return { dangerous: true, category: 'mcp_mutation', reason: 'MCP authentication/UI action' };
      }
      return { dangerous: false, category: 'mcp_status', reason: 'MCP status/search' };
    }
    return null;
  }
  const tool = String(call.tool ?? '').trim();
  if (isIbMutatingName(tool)) {
    return { dangerous: true, category: 'ib_mutation', reason: `live infobase tool '${call.server}.${tool}'` };
  }
  const plan = evaluatePlanMcpToolCall(call.server, tool);
  if (plan.allowed) {
    return { dangerous: false, category: 'mcp_read', reason: plan.reason };
  }
  if (ANON_SHARED_MEMORY_SERVERS.includes(String(call.server ?? '').trim())) {
    return { dangerous: true, category: 'mcp_mutation', reason: plan.reason };
  }
  if (isPlanReadOnlyToolName(tool)) {
    return { dangerous: false, category: 'mcp_read', reason: `read-only MCP tool '${call.server}.${tool}'` };
  }
  return { dangerous: true, category: 'mcp_mutation', reason: `MCP mutation '${call.server}.${tool}'` };
}

function isMcpGateway(toolName) {
  return toolName === 'mcp' || toolName === 'mcpScript' || (typeof toolName === 'string' && toolName.startsWith('mcp__'));
}

export function classifyDanger(toolName, input = {}, _cwd = process.cwd()) {
  const name = String(toolName ?? '');
  if (name === 'write' || name === 'edit') {
    const target = extractToolTarget(input) || '(unspecified path)';
    return { dangerous: true, category: 'file_write', reason: `${name} ${target}` };
  }
  if (name === 'bash' || name === 'powershell') {
    const command = typeof input?.command === 'string' ? input.command : '';
    const hit = dangerousBashReason(command);
    if (hit) return { dangerous: true, category: 'bash', reason: hit };
    return { dangerous: false, category: 'bash', reason: 'non-destructive shell command' };
  }
  if (isMcpGateway(name)) {
    return classifyMcp(name, input) ?? { dangerous: true, category: 'mcp_mutation', reason: `MCP call '${name}'` };
  }
  if (isIbMutatingName(name)) {
    return { dangerous: true, category: 'ib_mutation', reason: `live infobase tool '${name}'` };
  }
  if (isPlanReadOnlyToolName(name)) {
    return { dangerous: false, category: 'read', reason: `read-only tool '${name}'` };
  }
  return { dangerous: true, category: 'unknown', reason: `unclassified tool '${name}'` };
}
