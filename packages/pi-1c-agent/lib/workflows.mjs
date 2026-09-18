import fs from 'node:fs';
import path from 'node:path';
import { WRITER_SUBAGENTS } from './agent-policy.mjs';

export const VERIFICATION_STAGE = 'verification';

function parseInlineList(value) {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith('[') || !raw.endsWith(']')) throw new Error(`invalid inline list: ${raw}`);
  return raw.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
}

export function parseWorkflowYaml(text, source = '<workflow>') {
  if (typeof text !== 'string') throw new Error(`${source}: workflow must be text`);
  let name = '';
  const stages = [];
  let inStages = false;
  for (const [index, original] of text.split(/\r?\n/).entries()) {
    const noComment = original.replace(/\s+#.*$/, '');
    const trimmed = noComment.trim();
    if (!trimmed) continue;
    if (!inStages) {
      const nameMatch = trimmed.match(/^name:\s*([A-Za-z0-9_-]+)\s*$/);
      if (nameMatch) { name = nameMatch[1]; continue; }
      if (/^stages:\s*$/.test(trimmed)) { inStages = true; continue; }
      throw new Error(`${source}:${index + 1}: unsupported workflow field '${trimmed}'`);
    }
    const parallel = trimmed.match(/^-\s+parallel:\s*(\[[^\]]*\])\s*$/);
    if (parallel) {
      stages.push({ type: 'parallel', agents: parseInlineList(parallel[1]) });
      continue;
    }
    const scalar = trimmed.match(/^-\s+([A-Za-z0-9_-]+)\s*$/);
    if (scalar) {
      const value = scalar[1];
      stages.push(value === VERIFICATION_STAGE ? { type: 'verification' } : { type: 'agent', agent: value });
      continue;
    }
    throw new Error(`${source}:${index + 1}: unsupported stage '${trimmed}'`);
  }
  const workflow = { name, stages, source };
  const validation = validateWorkflow(workflow);
  if (!validation.ok) throw new Error(`${source}: ${validation.errors.join('; ')}`);
  return workflow;
}

export function validateWorkflow(workflow) {
  const errors = [];
  if (!workflow?.name || !/^[A-Za-z0-9_-]+$/.test(workflow.name)) errors.push('name is required');
  if (!Array.isArray(workflow?.stages) || workflow.stages.length === 0) errors.push('at least one stage is required');
  for (const [i, stage] of (workflow?.stages ?? []).entries()) {
    if (stage?.type === 'agent') {
      if (!/^1c-[A-Za-z0-9_-]+$/.test(stage.agent ?? '')) errors.push(`stage ${i + 1}: invalid agent '${stage.agent ?? ''}'`);
      continue;
    }
    if (stage?.type === 'parallel') {
      if (!Array.isArray(stage.agents) || stage.agents.length < 2) errors.push(`stage ${i + 1}: parallel requires at least two agents`);
      if ((stage.agents?.length ?? 0) > 8) errors.push(`stage ${i + 1}: parallel exceeds 8 agents`);
      for (const agent of stage.agents ?? []) {
        if (!/^1c-[A-Za-z0-9_-]+$/.test(agent)) errors.push(`stage ${i + 1}: invalid parallel agent '${agent}'`);
      }
      const writers = (stage.agents ?? []).filter((agent) => WRITER_SUBAGENTS.has(agent));
      if (writers.length > 1) errors.push(`stage ${i + 1}: more than one writer cannot run in parallel (${writers.join(', ')})`);
      continue;
    }
    if (stage?.type === 'verification') continue;
    errors.push(`stage ${i + 1}: unsupported stage type '${stage?.type ?? 'unknown'}'`);
  }
  if (workflow?.stages?.[0]?.type === 'verification') errors.push('stage 1: verification cannot be the first stage');
  return { ok: errors.length === 0, errors };
}

const workflowCache = new Map();

export function workflowStamp(packageRoot) {
  const dir = path.join(packageRoot, 'workflows');
  if (!fs.existsSync(dir)) return `${packageRoot}:missing`;
  return fs.readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort().map((name) => {
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      return `${name}:${st.mtimeMs}:${st.size}`;
    } catch {
      return `${name}:gone`;
    }
  }).join('|');
}

export function loadWorkflows(packageRoot) {
  const stamp = workflowStamp(packageRoot);
  const cached = workflowCache.get(packageRoot);
  if (cached && cached.stamp === stamp) return cached.map;
  const dir = path.join(packageRoot, 'workflows');
  const map = new Map();
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) {
      const file = path.join(dir, name);
      const workflow = parseWorkflowYaml(fs.readFileSync(file, 'utf8'), file);
      if (map.has(workflow.name)) throw new Error(`duplicate workflow '${workflow.name}'`);
      map.set(workflow.name, workflow);
    }
  }
  workflowCache.set(packageRoot, { stamp, map });
  return map;
}

export function resetWorkflowCacheForTests() {
  workflowCache.clear();
}

export function combineParallelHandoffs(results) {
  return [
    '## Parallel Upstream Handoffs',
    ...results.flatMap((result) => [`### ${result.agent}`, result.upstreamHandoff]),
  ].join('\n\n');
}

export function verifyWorkflowHandoff(result) {
  if (!result?.handoff || typeof result.handoff !== 'object') return { ok: false, reason: 'no validated upstream handoff available' };
  const raw = Array.isArray(result.handoff.verification) ? result.handoff.verification.filter(Boolean) : [];
  if (raw.length === 0) return { ok: false, reason: 'upstream handoff has no verification evidence' };
  const verification = raw.map((item) => (
    typeof item === 'string'
      ? item
      : `${item.kind || 'check'}:${item.status || 'unknown'} ${item.summary || ''}`.trim()
  ));
  return { ok: true, verification };
}
