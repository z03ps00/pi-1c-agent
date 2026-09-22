export const ICONS = Object.freeze({
  active: '●',
  idle: '○',
  ok: '✓',
  fail: '✗',
  selected: '›',
  collapsed: '▸',
  expanded: '▾',
});

export function statusIcon(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'completed') return ICONS.ok;
  if (key === 'failed') return ICONS.fail;
  if (key === 'idle' || key === 'cancelled') return ICONS.idle;
  return ICONS.active;
}
