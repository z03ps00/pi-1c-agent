import { formatDuration, shortAgentName } from './agents.mjs';

export function composeWorkflowView(state = {}) {
  const name = state.workflow || 'workflow';
  const stages = Array.isArray(state.stages) ? state.stages : [];
  const current = Number.isInteger(state.currentIndex) ? state.currentIndex : stages.findIndex((s) => s.status === 'working' || s.status === 'starting' || s.status === 'testing' || s.status === 'reviewing');
  const failed = stages.find((s) => s.status === 'failed');
  const allDone = stages.length > 0 && stages.every((s) => s.status === 'completed');
  const duration = formatDuration((state.endedAt || Date.now()) - (state.startedAt || Date.now()));

  const lines = [];
  if (failed) {
    lines.push(`✗ Workflow stopped · ${shortAgentName(failed.agent || failed.name)} · ${failed.error || 'failed'}`);
  } else if (allDone) {
    lines.push(`✓ Workflow completed · ${duration}`);
  } else {
    lines.push(`Workflow: ${name}`);
    lines.push('');
    stages.forEach((stage, i) => {
      const mark = stage.status === 'completed' ? '✓' : (stage.status === 'failed' ? '✗' : (i === current || ['working', 'starting', 'testing', 'reviewing'].includes(stage.status) ? '●' : '○'));
      const extra = stage.activity ? ` ${stage.activity}` : (stage.duration ? ` ${stage.duration}` : '');
      lines.push(`${mark} ${i + 1}/${stages.length} ${shortAgentName(stage.agent || stage.name)}${extra}`);
    });
  }
  return { lines, failedStage: failed ? (failed.agent || failed.name) : null, completed: allDone };
}

export function composeWorkflowResult(state = {}, { expanded = false } = {}) {
  const view = composeWorkflowView(state);
  if (!expanded) return view.lines.slice(0, view.failedStage ? 2 : 1);
  const log = Array.isArray(state.log) ? state.log : [];
  return [...view.lines, '', ...log];
}
