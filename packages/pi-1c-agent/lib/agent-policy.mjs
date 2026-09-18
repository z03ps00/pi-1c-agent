import { isPlanReadOnlyToolName } from './plan-policy.mjs';

export const PLAN_SUBAGENTS = new Set([
  '1c-explorer', '1c-analytic', '1c-architect', '1c-arch-reviewer', '1c-planner', '1c-code-reviewer',
]);

// Agents that can mutate the working tree. This is a static fallback used by
// workflow validation (which has no agent discovery); runtime prefers
// writerNames(discoveredAgents) derived from the tools each agent declares.
export const WRITER_SUBAGENTS = new Set([
  '1c-developer', '1c-metadata-manager', '1c-refactoring', '1c-performance-optimizer',
  '1c-error-fixer', '1c-tester', '1c-doc-writer', '1c-analytic', '1c-architect', '1c-planner',
]);

const BUILTIN_ALIASES = {
  Read: 'read', Write: 'write', Edit: 'edit', Grep: 'grep', Glob: 'find',
  Shell: 'bash', Bash: 'bash',
};

const BUILTIN_MUTATORS = new Set(['write', 'edit', 'bash']);
const ORCHESTRATION_TOOLS = new Set(['subagent_1c', 'workflow_1c']);
export const SIDE_EFFECT_NAMES = new Set([
  'none', 'filesystem-read', 'filesystem-write', 'shell',
  'mcp-read', 'mcp-write', 'network-read', 'network-write',
  'ib-read', 'ib-write', 'unknown',
]);
const READ_ONLY_EFFECTS = new Set(['none', 'mcp-read', 'filesystem-read', 'network-read', 'ib-read']);
export const RESOURCE_KINDS = new Set(['project-tree', 'git-index', 'build-dir', 'ib', 'knowledge', 'mcp']);
const ASK_BLOCKED_TOOLS = new Set(['write', 'edit', 'bash']);

export function normalizeRequestedTools(tools = []) {
  return [...new Set(tools.map((t) => BUILTIN_ALIASES[t] ?? String(t).toLowerCase()).filter(Boolean))];
}

function capabilityList(agent = {}) {
  return (agent.capabilities ?? []).map((x) => String(x).toLowerCase());
}

export function normalizeSideEffect(value) {
  const name = String(value || '').trim().toLowerCase();
  if (name === 'filesystem') return 'filesystem-write';
  if (SIDE_EFFECT_NAMES.has(name)) return name;
  return 'unknown';
}

export function parseSideEffects(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(raw.map(normalizeSideEffect))];
}

export function parseResources(value) {
  const out = [];
  if (!value) return out;
  if (typeof value === 'string') return parseResources(value.split(/[,\n]/));
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        const [name, mode] = entry.split(':').map((x) => String(x || '').trim().toLowerCase());
        if (RESOURCE_KINDS.has(name)) out.push({ name, mode: mode === 'shared' ? 'shared' : 'exclusive' });
      } else if (entry && typeof entry === 'object' && RESOURCE_KINDS.has(String(entry.name || '').toLowerCase())) {
        out.push({
          name: String(entry.name).toLowerCase(),
          mode: String(entry.mode || 'exclusive').toLowerCase() === 'shared' ? 'shared' : 'exclusive',
        });
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    for (const [name, mode] of Object.entries(value)) {
      const key = String(name).toLowerCase();
      if (!RESOURCE_KINDS.has(key)) continue;
      out.push({ name: key, mode: String(mode || '').toLowerCase() === 'shared' ? 'shared' : 'exclusive' });
    }
  }
  return out;
}

export function classifySideEffects(agent = {}) {
  if (Array.isArray(agent.sideEffects) && agent.sideEffects.length) {
    return parseSideEffects(agent.sideEffects);
  }
  const tools = normalizeRequestedTools(agent.tools ?? []);
  const caps = capabilityList(agent);
  const hasMutator = tools.some((name) => BUILTIN_MUTATORS.has(name));
  const hasMcp = caps.includes('mcp') || caps.includes('extensions');
  const effects = [];
  if (tools.includes('write') || tools.includes('edit')) effects.push('filesystem-write');
  if (tools.includes('bash')) effects.push('shell');
  if (hasMcp) {
    const declaredReadOnly = agent.mcpReadOnly === true;
    const inferredReadOnly = !hasMutator && PLAN_SUBAGENTS.has(agent.name);
    effects.push(declaredReadOnly || inferredReadOnly ? 'mcp-read' : 'unknown');
  }
  return effects.length ? [...new Set(effects)] : ['none'];
}

export function isMutatingSideEffect(effect) {
  const name = normalizeSideEffect(effect);
  return !READ_ONLY_EFFECTS.has(name);
}

export function isWriterAgent(agent = {}) {
  const tools = normalizeRequestedTools(agent.tools ?? []);
  if (tools.some((name) => BUILTIN_MUTATORS.has(name))) return true;
  return classifySideEffects(agent).some(isMutatingSideEffect);
}

export function declaredResources(agent = {}) {
  const parsed = parseResources(agent.resources);
  if (parsed.length) return parsed;
  if (isWriterAgent(agent)) return [{ name: 'project-tree', mode: 'exclusive' }];
  return [{ name: 'project-tree', mode: 'shared' }];
}

export function writerNames(agents = []) {
  return new Set(agents.filter((a) => isWriterAgent(a)).map((a) => a.name));
}

export function exclusiveResourceConflict(left = [], right = []) {
  const exclusive = new Set(left.filter((r) => r.mode === 'exclusive').map((r) => r.name));
  for (const res of right) {
    if (exclusive.has(res.name) && (res.mode === 'exclusive' || res.mode === 'shared')) return res.name;
  }
  const rightExclusive = new Set(right.filter((r) => r.mode === 'exclusive').map((r) => r.name));
  for (const res of left) {
    if (res.mode === 'shared' && rightExclusive.has(res.name)) return res.name;
  }
  return null;
}

export function childToolAllowlist({ mode, agentTools = [], capabilities = [], allTools = [] }) {
  const available = new Set(allTools);
  const base = normalizeRequestedTools(agentTools).filter((name) => available.has(name));
  let desired = [...base];
  if (capabilities.includes('mcp') || capabilities.includes('extensions')) {
    for (const name of allTools) {
      if (ORCHESTRATION_TOOLS.has(name)) continue;
      if (BUILTIN_MUTATORS.has(name) && !base.includes(name)) continue;
      desired.push(name);
    }
  }
  desired = [...new Set(desired)].filter((name) => !ORCHESTRATION_TOOLS.has(name));
  if (mode === 'plan' || mode === 'ask') {
    desired = desired.filter((name) => (isPlanReadOnlyToolName(name) || name === 'mcp') && name !== 'subagent_1c');
    for (const fallback of ['read', 'grep', 'find', 'ls']) {
      if (available.has(fallback) && !desired.includes(fallback)) desired.push(fallback);
    }
    if (mode === 'ask') desired = desired.filter((name) => !ASK_BLOCKED_TOOLS.has(name));
  }
  return desired;
}

export function childModeGuardText(mode) {
  if (mode === 'build') {
    return '\n\n# Parent 1C BUILD mode\nPerform only the assigned role. Do not recursively delegate to other 1C subagents.';
  }
  if (mode === 'plan') {
    return '\n\n# Parent 1C PLAN mode\nOperate read-only. Never mutate files, metadata, Git, dependencies, database state or external systems. Return findings and handoff only.';
  }
  return '\n\n# Parent 1C ASK mode\nOperate read-only. Never mutate files, metadata, Git, dependencies, database state or external systems. Return findings and handoff only.';
}

export function assertSubagentAllowedInMode(mode, agent = {}) {
  const name = agent.name || '';
  if (mode === 'ask' && isWriterAgent(agent)) {
    throw new Error(`1C ASK blocks writer/execution subagent '${name}'. Switch to BUILD with /mode build.`);
  }
  if (mode === 'plan' && !PLAN_SUBAGENTS.has(name)) {
    throw new Error(`1C PLAN blocks writer/execution subagent '${name}'. Continue planning with read-only roles.`);
  }
  return true;
}

export function evaluateSubagentRequest({ mode, agent, allTools = [] }) {
  assertSubagentAllowedInMode(mode, agent);
  return {
    spawn: true,
    modeGuard: childModeGuardText(mode),
    tools: childToolAllowlist({
      mode,
      agentTools: agent.tools,
      capabilities: agent.capabilities,
      allTools: allTools.length ? allTools : (agent.tools || []),
    }),
  };
}

export function parallelSafety(items = [], writers = WRITER_SUBAGENTS, agents = []) {
  if (items.length > 8) return { ok: false, reason: 'parallel batch exceeds 8 tasks' };
  const byName = new Map((agents || []).map((a) => [a.name, a]));
  const declared = items.filter((item) => parseResources(byName.get(item.agent)?.resources).length > 0);
  if (declared.length) {
    const held = [];
    for (const item of items) {
      const agent = byName.get(item.agent) || { name: item.agent };
      const resources = declaredResources(agent);
      for (const prev of held) {
        const conflict = exclusiveResourceConflict(prev.resources, resources);
        if (conflict) {
          return {
            ok: false,
            reason: `exclusive resource '${conflict}' intersects: ${prev.agent}, ${item.agent}`,
          };
        }
      }
      held.push({ agent: item.agent, resources });
    }
  } else {
    const writerSet = writers instanceof Set ? writers : new Set(writers);
    const conflicting = items.filter((x) => writerSet.has(x.agent));
    if (conflicting.length > 1) {
      return { ok: false, reason: `at most one writer may run in parallel: ${conflicting.map((x) => x.agent).join(', ')}` };
    }
  }
  if (byName.size) {
    const classified = items.map((item) => ({
      agent: item.agent,
      effects: classifySideEffects(byName.get(item.agent) || { name: item.agent }),
    }));
    const mutating = classified.filter((x) => x.effects.some(isMutatingSideEffect));
    const unknown = classified.filter((x) => x.effects.includes('unknown'));
    if (unknown.length && (unknown.length > 1 || mutating.length > 0)) {
      return {
        ok: false,
        reason: `unknown/external side effects cannot run with other mutating tasks: ${unknown.map((x) => x.agent).join(', ')}`,
      };
    }
  }
  return { ok: true };
}

export function selectExecutionStrategy(params = {}) {
  const hasAgent = Boolean(params.agent && params.task);
  const hasParallel = Array.isArray(params.parallel) && params.parallel.length > 0;
  const hasChain = Array.isArray(params.chain) && params.chain.length > 0;
  const n = [hasAgent, hasParallel, hasChain].filter(Boolean).length;
  if (n > 1) {
    return { ok: false, reason: 'specify exactly one of agent+task, parallel[], or chain[]' };
  }
  if (hasAgent) return { ok: true, strategy: 'agent' };
  if (hasParallel) return { ok: true, strategy: 'parallel' };
  if (hasChain) return { ok: true, strategy: 'chain' };
  return { ok: false, empty: true, reason: 'Provide agent+task, parallel[], or chain[]' };
}
