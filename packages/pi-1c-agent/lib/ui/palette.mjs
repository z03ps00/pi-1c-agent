export const PALETTE_SHORTCUT = 'ctrl+shift+k';

export const PALETTE_ACTIONS = Object.freeze([
  { id: 'mode', label: 'Режим', keywords: 'mode build plan ask', command: '/mode' },
  { id: 'taskmode', label: 'Путь задачи', keywords: 'taskmode docs-fix spec-authoring analytics quick-fix full-cycle', command: '/taskmode' },
  { id: 'agents', label: 'Субагенты', keywords: 'hub subagent roster', command: '/agents' },
  { id: 'status', label: 'Статус проекта', keywords: 'status health', command: '/status' },
  { id: 'config', label: 'Знания конфигурации', keywords: 'config knowledge fingerprint', command: '/config status' },
  { id: 'init', label: 'Мастер проекта', keywords: 'init wizard setup', command: '/init' },
  { id: 'memory', label: 'Память', keywords: 'wrap capture cognee', command: '/wrap auto status' },
  { id: 'session', label: 'Ротация сессии', keywords: 'session rotate context', command: '/session-rotate status' },
  { id: 'approve', label: 'Подтверждение действий', keywords: 'approve safe strict', command: '/approve' },
  { id: 'anon', label: 'Анонимная сессия', keywords: 'anon privacy', command: '/anon' },
  { id: 'sdlc', label: 'Глубина проверок', keywords: 'sdlc lite standard full verification', command: '/sdlc' },
  { id: 'theme', label: 'Тема', keywords: 'theme color dracula dark light standard vscode', command: '/theme' },
  { id: 'doctor', label: 'Диагностика', keywords: 'doctor health check', command: '/doctor' },
  { id: 'settings', label: 'Статус сессии', keywords: 'status health session', command: '/status' },
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
