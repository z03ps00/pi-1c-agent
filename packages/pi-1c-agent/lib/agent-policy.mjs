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
const READ_ONLY_EFFECTS = new Set(['none', 'mcp-read']);

export function normalizeRequestedTools(tools = []) {
  return [...new Set(tools.map((t) => BUILTIN_ALIASES[t] ?? String(t).toLowerCase()).filter(Boolean))];
}

function capabilityList(agent = {}) {
  return (agent.capabilities ?? []).map((x) => String(x).toLowerCase());
}

export function classifySideEffects(agent = {}) {
  if (Array.isArray(agent.sideEffects) && agent.sideEffects.length) {
    return agent.sideEffects.map((x) => String(x).toLowerCase());
  }
  const tools = normalizeRequestedTools(agent.tools ?? []);
  const caps = capabilityList(agent);
  const hasMutator = tools.some((name) => BUILTIN_MUTATORS.has(name));
  const hasMcp = caps.includes('mcp') || caps.includes('extensions');
  const effects = [];
  if (tools.includes('write') || tools.includes('edit')) effects.push('filesystem');
  if (tools.includes('bash')) effects.push('shell');
  if (hasMcp) {
    const declaredReadOnly = agent.mcpReadOnly === true;
    const inferredReadOnly = !hasMutator && PLAN_SUBAGENTS.has(agent.name);
    effects.push(declaredReadOnly || inferredReadOnly ? 'mcp-read' : 'unknown');
  }
  return effects.length ? [...new Set(effects)] : ['none'];
}

export function isMutatingSideEffect(effect) {
  return !READ_ONLY_EFFECTS.has(String(effect || 'none'));
}

export function isWriterAgent(agent = {}) {
  const tools = normalizeRequestedTools(agent.tools ?? []);
  if (tools.some((name) => BUILTIN_MUTATORS.has(name))) return true;
  return classifySideEffects(agent).some(isMutatingSideEffect);
}

export function writerNames(agents = []) {
  return new Set(agents.filter((a) => isWriterAgent(a)).map((a) => a.name));
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
  if (mode === 'plan') {
    desired = desired.filter((name) => (isPlanReadOnlyToolName(name) || name === 'mcp') && name !== 'subagent_1c');
    for (const fallback of ['read', 'grep', 'find', 'ls']) if (available.has(fallback) && !desired.includes(fallback)) desired.push(fallback);
  }
  return desired;
}

export function parallelSafety(items = [], writers = WRITER_SUBAGENTS, agents = []) {
  if (items.length > 8) return { ok: false, reason: 'parallel batch exceeds 8 tasks' };
  const writerSet = writers instanceof Set ? writers : new Set(writers);
  const conflicting = items.filter((x) => writerSet.has(x.agent));
  if (conflicting.length > 1) {
    return { ok: false, reason: `at most one writer may run in parallel: ${conflicting.map((x) => x.agent).join(', ')}` };
  }
  const byName = new Map((agents || []).map((a) => [a.name, a]));
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
