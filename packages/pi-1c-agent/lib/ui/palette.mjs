export const PALETTE_SHORTCUT = 'ctrl+shift+k';

export const PALETTE_ACTIONS = Object.freeze([
  { id: 'mode', label: 'Change mode', keywords: 'mode build plan ask', command: '/mode' },
  { id: 'agents', label: 'Agents', keywords: 'hub subagent roster', command: '/agents' },
  { id: 'status', label: 'Project status', keywords: 'status health', command: '/status' },
  { id: 'config', label: 'Configuration knowledge', keywords: 'config knowledge fingerprint', command: '/config status' },
  { id: 'init', label: 'Init project', keywords: 'init wizard setup', command: '/init' },
  { id: 'memory', label: 'Memory', keywords: 'wrap capture cognee', command: '/wrap auto status' },
  { id: 'session', label: 'Session rotation', keywords: 'session rotate context', command: '/session-rotate status' },
  { id: 'approve', label: 'Approval mode', keywords: 'approve safe strict', command: '/approve' },
  { id: 'anon', label: 'Anonymous mode', keywords: 'anon privacy', command: '/anon' },
  { id: 'theme', label: 'Theme', keywords: 'theme color dracula dark light standard vscode', command: '/theme' },
  { id: 'doctor', label: 'Doctor', keywords: 'doctor health check', command: '/doctor' },
  { id: 'settings', label: 'Settings', keywords: 'settings approve anon capture', command: '/approve' },
]);

function score(action, query) {
  const hay = `${action.id} ${action.label} ${action.keywords || ''}`.toLowerCase();
  if (hay.startsWith(query)) return 3;
  if (action.label.toLowerCase().includes(query)) return 2;
  if (hay.includes(query)) return 1;
  return 0;
}

export function filterPaletteActions(query, actions = PALETTE_ACTIONS) {
  const q = String(query || '').trim().toLowerCase();
  const list = [...actions];
  if (!q) return list;
  return list
    .map((a) => ({ action: a, score: score(a, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.action.label.localeCompare(b.action.label))
    .map((x) => x.action);
}

export function paletteBindsCtrlK() {
  return PALETTE_SHORTCUT === 'ctrl+k';
}
