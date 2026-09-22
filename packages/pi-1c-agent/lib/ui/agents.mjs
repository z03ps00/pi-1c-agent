export const AGENT_STATUSES = Object.freeze([
  'idle', 'starting', 'working', 'waiting', 'testing', 'reviewing', 'completed', 'failed', 'cancelled',
]);

export const ACTIVE_STATUSES = Object.freeze(['starting', 'working', 'waiting', 'testing', 'reviewing']);

export function mapRunStatus({ event, agentName = '', activity = '', aborted = false, ok = false } = {}) {
  if (aborted) return 'cancelled';
  const ev = String(event || '');
  if (ev === 'spawn' || ev === 'start') return 'starting';
  if (ev === 'wait') return 'waiting';
  if (ev === 'done' || ev === 'finish') return ok ? 'completed' : 'failed';
  const blob = `${agentName} ${activity}`.toLowerCase();
  if (/reviewer|reviewing|code-review/.test(blob)) return 'reviewing';
  if (/tester|testing|yaxunit|vanessa/.test(blob)) return 'testing';
  if (/wait/.test(blob)) return 'waiting';
  if (ev === 'progress' || ev === 'heartbeat') return 'working';
  return 'working';
}

export function formatDuration(ms) {
  const n = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  if (n < 60) return `${Math.round(n)}s`;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function shortAgentName(name) {
  return String(name || '').replace(/^1c-/, '') || 'agent';
}

export function composeAgentCard(run = {}, now = Date.now()) {
  const status = AGENT_STATUSES.includes(run.status) ? run.status : 'working';
  const started = Number(run.startedAt) || now;
  const ended = run.endedAt ? Number(run.endedAt) : now;
  const duration = formatDuration(ended - started);
  const name = shortAgentName(run.agent || run.name);
  const activity = String(run.activity || '').trim();
  const error = String(run.error || '').trim();
  return {
    name,
    status,
    kind: run.kind === 'writer' ? 'writer' : 'read-only',
    activity,
    duration,
    error,
    model: run.model || '',
    mode: run.mode || '',
  };
}

export function composeAgentCardLines(run = {}, now = Date.now()) {
  const card = composeAgentCard(run, now);
  if (card.status === 'completed') return [`✓ ${card.name}   ${card.duration}   completed`];
  if (card.status === 'failed') {
    const lines = [`✗ ${card.name}   ${card.duration}   failed`];
    if (card.error) lines.push(`  ${card.error}`);
    return lines;
  }
  if (card.status === 'cancelled') return [`○ ${card.name}   ${card.duration}   cancelled`];
  const lines = [
    `╭─ AGENT ${card.name} ──────────────────────╮`,
    `│ ● ${card.status.padEnd(36)}│`,
  ];
  if (card.activity) lines.push(`│ ${card.activity.slice(0, 36).padEnd(36)}│`);
  lines.push(`│ ${card.duration.padEnd(36)}│`, `╰────────────────────────────────────────╯`);
  return lines;
}

export function composeHubRows(discovered = [], runs = [], now = Date.now()) {
  const byName = new Map(runs.map((r) => [r.agent, r]));
  const names = new Set([...discovered.map((a) => a.name), ...runs.map((r) => r.agent)]);
  const rows = [];
  for (const name of names) {
    const meta = discovered.find((a) => a.name === name) || { name, kind: 'read-only' };
    const run = byName.get(name);
    const card = composeAgentCard({
      agent: name,
      kind: meta.kind || (meta.writer ? 'writer' : 'read-only'),
      status: run ? run.status : 'idle',
      activity: run?.activity,
      startedAt: run?.startedAt,
      endedAt: run?.endedAt,
      error: run?.error,
      model: run?.model || meta.model,
      mode: run?.mode,
    }, now);
    rows.push({
      ...card,
      agent: name,
      id: run?.id,
      stoppable: Boolean(run && ACTIVE_STATUSES.includes(run.status)),
    });
  }
  return rows.sort((a, b) => Number(b.stoppable) - Number(a.stoppable) || a.name.localeCompare(b.name));
}

export function composeHubText(rows = []) {
  const lines = ['1C AGENTS', ''];
  if (!rows.length) {
    lines.push('  No 1C agents discovered. Run /bootstrap.');
  } else {
    for (const row of rows) {
      const mark = row.status === 'idle' || row.status === 'cancelled' ? '○' : row.status === 'completed' ? '✓' : row.status === 'failed' ? '✗' : '●';
      lines.push(`  ${mark} ${row.name.padEnd(16)} ${row.status.padEnd(12)} ${(row.stoppable ? row.duration : '').padEnd(6)} ${row.kind}`);
      if (row.activity) lines.push(`    ${row.activity}`);
      if (row.error) lines.push(`    ${row.error}`);
    }
  }
  lines.push('', 'Enter inspect    x stop    Esc close');
  return lines.join('\n');
}

export function composeWidgetLines(runs = [], now = Date.now()) {
  const active = runs.filter((r) => ACTIVE_STATUSES.includes(r.status));
  if (!active.length) {
    const recent = runs.filter((r) => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled');
    if (!recent.length) return [];
    const last = recent[recent.length - 1];
    const card = composeAgentCard(last, now);
    return [`Agents  ${card.status} · ${card.name}`];
  }
  const lines = [`Agents  ${active.length} running`];
  active.forEach((run, i) => {
    const card = composeAgentCard(run, now);
    const branch = i === active.length - 1 ? '└─' : '├─';
    lines.push(`${branch} ${card.name.padEnd(12)} ● ${card.activity || card.status}`);
  });
  return lines;
}

export class RunTracker {
  constructor({ publish: pub } = {}) {
    this.runs = new Map();
    this.discovered = [];
    this.publish = typeof pub === 'function' ? pub : () => {};
  }

  setDiscovered(list = []) {
    this.discovered = Array.isArray(list) ? list : [];
    this.#emit();
  }

  #emit() {
    this.publish('agents', { runs: this.list(), discovered: this.discovered });
  }

  start(record) {
    const id = record.id || `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const run = {
      id,
      agent: record.agent,
      kind: record.kind === 'writer' ? 'writer' : 'read-only',
      mode: record.mode || '',
      model: record.model || '',
      status: 'starting',
      activity: record.activity || 'starting',
      startedAt: Date.now(),
      endedAt: null,
      error: '',
      workflowId: record.workflowId,
      stageIndex: record.stageIndex,
      abort: record.abort,
    };
    this.runs.set(id, run);
    this.#emit();
    return id;
  }

  update(id, patch = {}) {
    const run = this.runs.get(id);
    if (!run) return;
    Object.assign(run, patch);
    this.#emit();
  }

  finish(id, { ok = false, aborted = false, error = '' } = {}) {
    const run = this.runs.get(id);
    if (!run) return;
    run.endedAt = Date.now();
    run.status = aborted ? 'cancelled' : ok ? 'completed' : 'failed';
    if (error) run.error = String(error);
    this.#emit();
  }

  stop(id) {
    const run = this.runs.get(id);
    if (!run || !ACTIVE_STATUSES.includes(run.status)) return false;
    try { run.abort?.abort?.(); } catch { /* ignore */ }
    return true;
  }

  list() {
    return [...this.runs.values()].map((r) => ({ ...r, abort: undefined }));
  }

  get(id) {
    return this.runs.get(id);
  }

  clearSettled() {
    for (const [id, run] of this.runs) {
      if (!ACTIVE_STATUSES.includes(run.status)) this.runs.delete(id);
    }
    this.#emit();
  }
}
