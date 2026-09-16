export const STATE_CUSTOM_TYPE = 'pi-1c-session-rotate-state';
export const DEFAULT_THRESHOLD = 85;
export const MIN_THRESHOLD = 50;
export const MAX_THRESHOLD = 95;
export const THRESHOLD_RANGE_MESSAGE = `Threshold must be an integer between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}.`;

export function defaultState() {
  return { enabled: false, thresholdPercent: DEFAULT_THRESHOLD };
}

export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const enabled = raw.enabled === true;
  const n = Number(raw.thresholdPercent);
  const thresholdPercent = Number.isInteger(n) && n >= MIN_THRESHOLD && n <= MAX_THRESHOLD ? n : DEFAULT_THRESHOLD;
  return { enabled, thresholdPercent };
}

export function restoreStateFromEntries(entries) {
  if (!Array.isArray(entries)) return defaultState();
  const hits = entries.filter((e) => e && e.type === 'custom' && e.customType === STATE_CUSTOM_TYPE);
  const last = hits[hits.length - 1];
  return normalizeState(last?.data?.state ?? last?.data);
}

export function parseSessionRotateArgs(args) {
  const raw = String(args ?? '').trim().toLowerCase().replace(/[.,;:]+$/, '');
  if (!raw || raw === 'status') return { action: 'status' };
  if (raw === 'off') return { action: 'off' };
  if (raw === 'continue') return { action: 'continue' };
  if (raw === 'on') return { action: 'on' };
  const onPercent = raw.match(/^on\s+(\d+)$/);
  if (onPercent) return { action: 'on', value: Number(onPercent[1]) };
  if (/^\d+$/.test(raw)) return { action: 'threshold', value: Number(raw) };
  return { action: 'unknown', raw };
}

export function applyThreshold(state, value) {
  const current = normalizeState(state);
  if (!Number.isInteger(value) || value < MIN_THRESHOLD || value > MAX_THRESHOLD) {
    return { ok: false, state: current, error: THRESHOLD_RANGE_MESSAGE };
  }
  return { ok: true, state: { ...current, thresholdPercent: value } };
}

export function applyCommand(state, parsed) {
  const current = normalizeState(state);
  if (parsed.action === 'status') return { ok: true, state: current, changed: false };
  if (parsed.action === 'off') return { ok: true, state: { ...current, enabled: false }, changed: true };
  if (parsed.action === 'on') {
    if (parsed.value !== undefined) {
      const next = applyThreshold(current, parsed.value);
      if (!next.ok) return next;
      return { ok: true, state: { ...next.state, enabled: true }, changed: true };
    }
    return { ok: true, state: { ...current, enabled: true }, changed: true };
  }
  if (parsed.action === 'threshold') {
    const next = applyThreshold(current, parsed.value);
    if (!next.ok) return next;
    return { ok: true, state: next.state, changed: next.state.thresholdPercent !== current.thresholdPercent };
  }
  return { ok: false, state: current, error: `Unknown session-rotate argument: ${parsed.raw ?? ''}. Use on | off | status | <${MIN_THRESHOLD}-${MAX_THRESHOLD}>.` };
}

export function statusText(state, host = 'pi') {
  const s = normalizeState(state);
  const hostNote = host === 'cursor' ? ' (Cursor host: rotation does not activate)' : '';
  return `session-rotate: ${s.enabled ? 'on' : 'off'}, threshold ${s.thresholdPercent}%${hostNote}`;
}

export function footerLabel(state) {
  const s = normalizeState(state);
  return s.enabled ? `rotate:${s.thresholdPercent}%` : 'rotate:off';
}

export function shouldRotateOnIdle({ enabled, percent, thresholdPercent, alreadyRotating = false } = {}) {
  if (!enabled || alreadyRotating) return false;
  if (percent === null || percent === undefined) return false;
  const n = Number(percent);
  if (!Number.isFinite(n)) return false;
  return n >= Number(thresholdPercent);
}

export function shouldArmMidTurnRotation({
  enabled,
  percent,
  thresholdPercent,
  isIdle = false,
  handoffPending = false,
  rotating = false,
} = {}) {
  if (!enabled || isIdle || handoffPending || rotating) return false;
  if (percent === null || percent === undefined) return false;
  const n = Number(percent);
  if (!Number.isFinite(n)) return false;
  return n >= Number(thresholdPercent);
}

export function midTurnBlockReason(percent, thresholdPercent) {
  return `session-rotate: context ${percent}% >= ${thresholdPercent}% — winding down this turn to rotate into a fresh session. Stop calling tools and end your turn; a handoff will be written and the task continues in a new session.`;
}

export function shouldCancelCompact({ enabled, reason, isIdle, alreadyCancelledForRotation = false } = {}) {
  if (!enabled) return false;
  if (alreadyCancelledForRotation) return false;
  if (reason === 'overflow' || reason === 'manual') return false;
  if (reason !== 'threshold') return false;
  return Boolean(isIdle);
}

export function shouldDeferRotationAfterOverflow({ enabled, reason } = {}) {
  return Boolean(enabled && reason === 'overflow');
}

export function handoffTimestamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

export function defaultHandoffPath(cwd, now) {
  return `${String(cwd).replace(/[/\\]$/, '')}/handoffs/handoff-${handoffTimestamp(now)}.md`;
}

export function buildHandoffInstruction(handoffPath) {
  return [
    'Write a session handoff now using the handoff skill.',
    `Target path: ${handoffPath}`,
    'Use the standard handoff format (goal, current state, files changed, verification, next steps, what to load next).',
    'Do not copy secrets, tokens, passwords, .dev.env contents, connection strings, or full transcript/tool dumps.',
    'Do not continue the original task in this turn. After the file is written, stop.',
  ].join(' ');
}

export function buildKickoff(handoffPath) {
  return `Continue the 1C task. Read the handoff at ${handoffPath}; do not repeat completed discovery; finish the remaining next steps.`;
}

const SECRET_LINE_RE = /(password|passwd|secret|api[_-]?key|token|authorization|connection.?string|\.dev\.env|ib_password|repository_password|support_key)/i;

export function handoffContainsSecrets(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return SECRET_LINE_RE.test(text);
}

export function handoffReady(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'missing' };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (handoffContainsSecrets(trimmed)) return { ok: false, reason: 'secrets' };
  return { ok: true };
}

export function rotationNewSessionOptions({ parentSession, state, kickoff }) {
  const snapshot = normalizeState(state);
  return {
    parentSession,
    setupState: { customType: STATE_CUSTOM_TYPE, data: { state: snapshot } },
    kickoff,
  };
}
