export const PALETTE_SHORTCUT = 'ctrl+shift+k';

export const PALETTE_ACTIONS = Object.freeze([
  { id: 'mode', label: 'Сменить режим', keywords: 'режим mode build plan ask', command: '/mode' },
  { id: 'agents', label: 'Агенты', keywords: 'хаб субагент roster hub subagent', command: '/agents' },
  { id: 'status', label: 'Статус проекта', keywords: 'статус status health', command: '/status' },
  { id: 'config', label: 'Знания конфигурации', keywords: 'config knowledge fingerprint знания', command: '/config status' },
  { id: 'init', label: 'Инициализация проекта', keywords: 'init wizard setup инициализация', command: '/init' },
  { id: 'memory', label: 'Память', keywords: 'wrap capture cognee память', command: '/wrap auto status' },
  { id: 'session', label: 'Ротация сеанса', keywords: 'session rotate context ротация', command: '/session-rotate status' },
  { id: 'approve', label: 'Режим подтверждения', keywords: 'approve safe strict подтверждение', command: '/approve' },
  { id: 'anon', label: 'Анонимный режим', keywords: 'anon privacy анон', command: '/anon' },
  { id: 'doctor', label: 'Doctor', keywords: 'doctor health check доктор', command: '/doctor' },
  { id: 'settings', label: 'Настройки', keywords: 'settings approve anon capture настройки', command: '/approve' },
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
