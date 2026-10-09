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
  { id: 'profile', label: 'Команды профиля' },
  { id: 'skills', label: 'Навыки' },
  { id: 'prompts', label: 'Готовые задания' },
]);

const BUILTIN_NAMES = new Set(PI_CORE_COMMANDS.map((item) => item.name));

export function sectionForCommand(command) {
  const source = String(command?.source || '');
  const name = String(command?.name || '');
  if (source === 'skill' || name.startsWith('skill:')) return 'skills';
  if (source === 'prompt') return 'prompts';
  if (source === 'builtin' || BUILTIN_NAMES.has(name)) return 'pi';
  return 'profile';
}

export function buildCommandSections(commands = [], builtins = PI_CORE_COMMANDS) {
  const buckets = { pi: [], profile: [], skills: [], prompts: [] };
  const seen = new Set();
  const incoming = [
    ...builtins.map((item) => ({ ...item, source: 'builtin' })),
    ...commands,
  ];
  for (const command of incoming) {
    const name = String(command?.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const section = sectionForCommand(command);
    buckets[section].push({
      name,
      description: String(command.description || '').trim(),
      source: command.source || section,
    });
  }
  for (const list of Object.values(buckets)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return COMMAND_SECTIONS.map((section) => ({
    ...section,
    commands: buckets[section.id],
  }));
}

export function sectionSummary(sections) {
  return sections.map((section) => ({
    id: section.id,
    label: section.label,
    count: section.commands.length,
  }));
}
