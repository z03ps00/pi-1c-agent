export const MODE_COLOR = Object.freeze({
  build: 'success',
  plan: 'warning',
  ask: 'accent',
});

export const STATUS_COLOR = Object.freeze({
  idle: 'dim',
  starting: 'accent',
  working: 'accent',
  waiting: 'warning',
  testing: 'accent',
  reviewing: 'accent',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
});

export function modeColor(mode) {
  const key = String(mode || '').toLowerCase();
  return MODE_COLOR[key] || 'dim';
}

export function statusColor(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_COLOR[key] || 'dim';
}

/** Apply a Pi theme token. Never emit raw RGB/ANSI when a token exists. */
export function colorize(theme, token, text) {
  const value = String(text ?? '');
  if (!theme || typeof theme.fg !== 'function') return value;
  const name = String(token || 'text');
  try { return theme.fg(name, value); } catch { return value; }
}

export function stripAnsi(text) {
  return String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

export function visibleWidth(text) {
  return stripAnsi(text).length;
}
