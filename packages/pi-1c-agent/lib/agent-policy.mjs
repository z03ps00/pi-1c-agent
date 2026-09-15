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

// Built-in tools that mutate state. They are only granted when the agent
// explicitly declares them, never implicitly through a capability.
const BUILTIN_MUTATORS = new Set(['write', 'edit', 'bash']);
const ORCHESTRATION_TOOLS = new Set(['subagent_1c', 'workflow_1c']);

export function normalizeRequestedTools(tools = []) {
  return [...new Set(tools.map((t) => BUILTIN_ALIASES[t] ?? String(t).toLowerCase()).filter(Boolean))];
}

export function isWriterAgent(agent = {}) {
  const tools = normalizeRequestedTools(agent.tools ?? []);
  return tools.some((name) => BUILTIN_MUTATORS.has(name));
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
      // A capability must never silently grant a built-in mutator that the
      // agent did not declare in its own tools list.
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

export function parallelSafety(items = [], writers = WRITER_SUBAGENTS) {
  if (items.length > 8) return { ok: false, reason: 'parallel batch exceeds 8 tasks' };
  const writerSet = writers instanceof Set ? writers : new Set(writers);
  const conflicting = items.filter((x) => writerSet.has(x.agent));
  if (conflicting.length > 1) {
    return { ok: false, reason: `at most one writer may run in parallel: ${conflicting.map((x) => x.agent).join(', ')}` };
  }
  return { ok: true };
}
