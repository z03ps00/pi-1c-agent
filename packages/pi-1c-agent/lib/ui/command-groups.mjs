/** Pi interactive builtins. Names follow the host, wording is local. */
export const PI_CORE_COMMANDS = Object.freeze([
  { name: 'settings', description: 'Настройки терминала' },
  { name: 'model', description: 'Выбор модели' },
  { name: 'tree', description: 'Ветки сессии' },
  { name: 'thinking', description: 'Уровень рассуждения' },
  { name: 'scoped-models', description: 'Модели для быстрого переключения' },
  { name: 'export', description: 'Экспорт сессии' },
  { name: 'import', description: 'Импорт файла сессии' },
  { name: 'share', description: 'Поделиться сессией' },
  { name: 'copy', description: 'Скопировать последний ответ' },
  { name: 'name', description: 'Имя сессии' },
  { name: 'session', description: 'Файл сессии и токены' },
  { name: 'changelog', description: 'Журнал изменений оболочки' },
  { name: 'hotkeys', description: 'Список клавиш' },
  { name: 'fork', description: 'Ответвление от раннего сообщения' },
  { name: 'clone', description: 'Копия этой сессии' },
  { name: 'trust', description: 'Доверять этому проекту' },
  { name: 'login', description: 'Вход к провайдеру' },
  { name: 'logout', description: 'Выход' },
  { name: 'new', description: 'Новая сессия' },
  { name: 'compact', description: 'Сжать историю' },
  { name: 'resume', description: 'Открыть другую сессию' },
  { name: 'reload', description: 'Перечитать расширения и промпты' },
  { name: 'quit', description: 'Выйти' },
]);

export const COMMAND_SECTIONS = Object.freeze([
  { id: 'pi', label: 'Команды Pi' },
  { id: 'onec', label: 'Команды 1С' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'mcp', label: 'MCP и интеграции' },
  { id: 'settings', label: 'Настройки' },
  { id: 'agents', label: 'Агенты' },
  { id: 'knowledge', label: 'Знания' },
  { id: 'sessions', label: 'Сессии и память' },
  { id: 'profile', label: 'Профиль' },
  { id: 'skills', label: 'Навыки' },
]);

const BUILTIN_NAMES = new Set(PI_CORE_COMMANDS.map((item) => item.name));

/** Slash commands and prompt tasks. A Pi builtin name wins over this map. */
const SECTION_BY_NAME = Object.freeze({
  init: 'onec',
  initproject: 'onec',
  'layout-view': 'onec',
  reglog: 'onec',
  'build-release': 'onec',
  'check-uuid': 'onec',
  'deploy-and-test': 'onec',
  'ext-plan': 'onec',
  getconfigfiles: 'onec',
  loadfrom1cbase: 'onec',
  'restore-testbase': 'onec',
  update1cbase: 'onec',
  'test-fix-loop': 'onec',
  installfilesupdatescript: 'onec',
  mcp: 'mcp',
  'pi-mcp': 'mcp',
  'mcp-auth': 'mcp',
  mcpconfig: 'mcp',
  capabilities: 'mcp',
  checkmcp: 'mcp',
  setupmcp: 'mcp',
  installmcp: 'mcp',
  updatemcp: 'mcp',
  installtools: 'mcp',
  'install-agent-browser': 'mcp',
  'install-atlassian-mcp': 'mcp',
  'install-edt-mcp': 'mcp',
  'install-memory-mcp': 'mcp',
  'install-officecli': 'mcp',
  'install-rtk': 'mcp',
  'install-vanessa-mcp': 'mcp',
  'install-windows-mcp': 'mcp',
  anon: 'settings',
  approve: 'settings',
  sdlc: 'settings',
  litemode: 'settings',
  uitests: 'settings',
  previewmode: 'settings',
  caveman: 'settings',
  economymode: 'settings',
  rulesmodel: 'settings',
  theme: 'settings',
  'agent-scope': 'settings',
  mode: 'agents',
  taskmode: 'agents',
  agents: 'agents',
  status: 'agents',
  implement: 'agents',
  review: 'agents',
  bugfix: 'agents',
  config: 'knowledge',
  learn: 'knowledge',
  rule: 'knowledge',
  evolve: 'knowledge',
  learning: 'knowledge',
  'openspec-setup': 'knowledge',
  'init-knowledge': 'knowledge',
  context: 'sessions',
  'session-stats': 'sessions',
  'memory-flush': 'sessions',
  wrap: 'sessions',
  'capture-model': 'sessions',
  'session-rotate': 'sessions',
  doctor: 'profile',
  bootstrap: 'profile',
  commands: 'profile',
  palette: 'profile',
  groups: 'profile',
  checkupdates: 'profile',
  'doctor-explain': 'profile',
  'review-airules': 'profile',
  support: 'profile',
  supportstatus: 'profile',
  'update-pi-cli': 'profile',
  'update-profile': 'profile',
  updaterules: 'profile',
  'ponytail-review': 'profile',
});

/** Third-party slash commands keep their names. The groups list shows these labels. */
export const PROFILE_COMMAND_LABELS = Object.freeze({
  'cursor-cloud': 'Список, архив или удаление облачных агентов Cursor этой ветки',
  'cursor-fast': 'Быстрый режим Cursor для выбранной модели',
  'cursor-http': 'Совместимость транспорта HTTP/1.1/SSE Cursor SDK',
  'cursor-local-resume-cleanup': 'Просмотр или удаление устаревших локальных агентов Cursor SDK',
  'cursor-mode': 'Режим разговора Cursor SDK: agent или plan',
  'cursor-refresh-config': 'Обновить конфиг Cursor в текущем пуле SDK',
  'cursor-refresh-models': 'Обновить каталог моделей Cursor без перезапуска Pi',
  'cursor-runtime': 'Среда Cursor в этой сессии: local или cloud',
  'cursor-tools': 'Живые поверхности инструментов Cursor (отладка)',
  mcp: 'Статус серверов MCP',
  'pi-mcp': 'Статус серверов MCP',
  'mcp-auth': 'Вход на MCP-сервер (OAuth)',
});

function commandDescription(command, name) {
  if (Object.prototype.hasOwnProperty.call(PROFILE_COMMAND_LABELS, name)) {
    return PROFILE_COMMAND_LABELS[name];
  }
  return String(command.description || '').trim();
}

export function sectionForCommand(command) {
  const source = String(command?.source || '');
  const name = String(command?.name || '');
  if (source === 'skill' || name.startsWith('skill:')) return 'skills';
  if (source === 'builtin' || BUILTIN_NAMES.has(name)) return 'pi';
  if (name.startsWith('cursor-')) return 'cursor';
  return SECTION_BY_NAME[name] || 'profile';
}

export function buildCommandSections(commands = [], builtins = PI_CORE_COMMANDS) {
  const buckets = Object.fromEntries(COMMAND_SECTIONS.map((section) => [section.id, []]));
  const seen = new Set();
  const incoming = [
    ...builtins.map((item) => ({ ...item, source: 'builtin' })),
    ...commands,
  ];
  for (const command of incoming) {
    const name = String(command?.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const resolved = sectionForCommand(command);
    const section = buckets[resolved] ? resolved : 'profile';
    buckets[section].push({
      name,
      description: commandDescription(command, name),
      source: command.source || section,
    });
  }
  for (const list of Object.values(buckets)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return COMMAND_SECTIONS
    .map((section) => ({
      ...section,
      commands: buckets[section.id],
    }))
    .filter((section) => section.commands.length > 0);
}

export function sectionSummary(sections) {
  return sections.map((section) => ({
    id: section.id,
    label: section.label,
    count: section.commands.length,
  }));
}

function commandScore(command, query) {
  const name = String(command?.name || '').toLowerCase();
  const description = String(command?.description || '').toLowerCase();
  if (name.startsWith(query)) return 3;
  if (name.includes(query)) return 2;
  if (description.includes(query)) return 1;
  return 0;
}

/** Flat command list. An empty query keeps every command; a typed query ranks matches. */
export function filterCommandSections(sections, query) {
  const needle = String(query || '').trim().toLowerCase().replace(/^\//, '');
  const hits = [];
  for (const section of sections || []) {
    for (const command of section.commands || []) {
      const score = needle ? commandScore(command, needle) : 1;
      if (!score) continue;
      hits.push({ command, score, section: section.label || '' });
    }
  }
  if (needle) {
    hits.sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name));
  }
  return hits.map((hit) => ({ ...hit.command, section: hit.section }));
}

/** Empty invocation opens an overlay. Choosing one in the groups list runs it. */
export const PICKER_COMMAND_ACTIONS = Object.freeze({
  mode: 'command:mode',
  learning: 'command:learning',
  learn: 'command:learn',
  evolve: 'command:evolve',
  taskmode: 'command:taskmode',
  anon: 'command:anon',
  approve: 'command:approve',
  sdlc: 'command:sdlc',
  litemode: 'command:litemode',
  uitests: 'command:uitests',
  previewmode: 'command:previewmode',
  caveman: 'command:caveman',
  economymode: 'command:economymode',
  rulesmodel: 'command:rulesmodel',
  mcpconfig: 'command:mcpconfig',
  theme: 'command:theme',
  init: 'command:init',
  'session-rotate': 'command:session-rotate',
  'capture-model': 'command:capture-model',
});

export function groupSelectionResult(name, knownActions) {
  const command = String(name || '').trim();
  if (!command) return { kind: 'cancel' };
  const actionId = PICKER_COMMAND_ACTIONS[command] || '';
  const known = knownActions == null
    || (typeof knownActions.has === 'function' ? knownActions.has(actionId) : knownActions.includes?.(actionId));
  if (actionId && known) return { kind: 'picker', actionId, command };
  return { kind: 'run', command, text: `/${command}` };
}

/** Put the slash command in the focused editor and press Enter. */
export function submitFocusedEditor(tui, text) {
  const command = String(text || '').trim();
  if (!command.startsWith('/')) return false;
  const editor = typeof tui?.getFocusedComponent === 'function'
    ? tui.getFocusedComponent()
    : tui?.focusedComponent;
  if (!editor || typeof editor.setText !== 'function' || typeof editor.handleInput !== 'function') return false;
  editor.setText(command);
  editor.handleInput('\r');
  return true;
}
