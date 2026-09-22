function line(label, value) {
  const v = value == null || value === '' ? '—' : String(value);
  return `  ${label.padEnd(14)} ${v}`;
}

export function composeStatus(snapshot = {}) {
  const mode = String(snapshot.mode || 'ask').toUpperCase();
  const anon = Math.trunc(Number(snapshot.anonLevel) || 0);
  const approve = String(snapshot.approve || 'off');
  const pct = snapshot.contextPercent == null ? null : Math.round(Number(snapshot.contextPercent));
  const runs = Array.isArray(snapshot.agents) ? snapshot.agents : [];
  const active = runs.filter((r) => ['starting', 'working', 'waiting', 'testing', 'reviewing'].includes(String(r.status)));
  const git = snapshot.gitBranch ? `${snapshot.gitBranch}${snapshot.gitDirty ? ' · dirty' : ''}` : '—';

  const lines = [
    'PI 1C Agent',
    '',
    'Project',
    `  ${snapshot.projectName || '(unknown)'}`,
    snapshot.configuration ? `  Configuration ${snapshot.configuration}` : '  Configuration —',
    `  Git ${git}`,
    '',
    'Agent',
    line('Mode', mode),
    line('Approval', approve),
    line('Anonymous', anon > 0 ? String(anon) : 'off'),
    line('Thinking', snapshot.thinkingLevel || 'off'),
    '',
    'Memory',
    line('Capture', snapshot.captureEnabled ? (snapshot.captureMode || 'on') : 'off'),
    line('Cognee', snapshot.cognee || 'unknown'),
    line('OpenViking', snapshot.openviking || 'unknown'),
    '',
    'Session',
    line('Context', pct == null ? '—' : `${pct}%`),
    line('MCP', `${Number(snapshot.mcpConnected) || 0}/${Number(snapshot.mcpEnabled) || 0}`),
    line('Rotation', `${snapshot.rotateEnabled ? 'on' : 'off'} · ${Number.isFinite(Number(snapshot.rotateThreshold)) ? Math.round(Number(snapshot.rotateThreshold)) : 85}%`),
    '',
    'Agents',
    `  ${active.length} running`,
  ];
  for (const run of runs.slice(0, 8)) {
    lines.push(`  ${(run.agent || run.name || 'agent').replace(/^1c-/, '')}      ${run.status || ''}`.trimEnd());
  }
  lines.push('', 'Knowledge', `  ${snapshot.knowledge || 'uninitialized'}`);
  if (snapshot.fingerprint) lines.push(`  fingerprint ${snapshot.fingerprint}`);
  return lines.join('\n');
}
