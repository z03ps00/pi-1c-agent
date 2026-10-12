import { BOT_COMMANDS } from './choices.mjs';
import { MODEL_PRESETS, UPDATE_ACTIONS } from './panel.mjs';
import { pageSlice } from './format.mjs';

export function modelCatalogView(entries, page = 0) {
  const list = Array.isArray(entries) ? entries : [];
  const sliced = pageSlice(list, page, 8);
  const rows = sliced.items.map((entry, index) => [{
    text: `${entry.provider} / ${entry.model}`.slice(0, 40),
    data: `cat:${sliced.start + index}`,
  }]);
  const pager = [];
  if (sliced.page > 0) pager.push({ text: 'Назад', data: `mpg:${sliced.page - 1}` });
  if (sliced.page + 1 < sliced.pages) pager.push({ text: 'Дальше', data: `mpg:${sliced.page + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: 'Меню', data: 'nav:menu' }]);
  const text = list.length
    ? `Модели подключённых провайдеров Pi. Страница ${sliced.page + 1} из ${sliced.pages}, всего ${list.length}.`
    : 'Каталог моделей пуст.';
  return { text, keyboard: rows };
}

export function telegramReplyMarkup(keyboard) {
  if (!keyboard) return undefined;
  return {
    inline_keyboard: keyboard.map((row) => row.map((button) => ({
      text: button.text,
      callback_data: button.callback_data ?? button.data,
    }))),
  };
}

export function commandMenuKeyboard() {
  const rows = [];
  for (let index = 0; index < BOT_COMMANDS.length; index += 2) {
    const row = [{ text: `/${BOT_COMMANDS[index].command}`, data: `cmd:${BOT_COMMANDS[index].command}` }];
    const next = BOT_COMMANDS[index + 1];
    if (next) row.push({ text: `/${next.command}`, data: `cmd:${next.command}` });
    rows.push(row);
  }
  rows.push([{ text: 'Меню', data: 'nav:menu' }]);
  return rows;
}

export function homeKeyboard() {
  return [
    [{ text: 'Статус', data: 'nav:status' }, { text: 'Новый чат', data: 'nav:new' }],
    [{ text: 'Проект', data: 'nav:project' }, { text: 'Сессии', data: 'nav:sessions' }],
    [{ text: 'Модель', data: 'nav:model' }, { text: 'Диагностика', data: 'nav:diag' }],
    [{ text: 'Backup', data: 'nav:backup' }, { text: 'Обновление', data: 'nav:update' }],
    [{ text: 'Спрашивать перед опасным', data: 'nav:safe' }],
  ];
}

export function homeText(state, modelLine = '') {
  const project = state.project || 'не выбран';
  return [
    `Проект: ${project}`,
    `Режим: ${state.mode || 'ask'}`,
    `Approve: ${state.approve || 'off'}`,
    modelLine,
    'Команды агента пишутся как в Pi. Пустая команда из короткого списка открывает кнопки.',
  ].filter(Boolean).join('\n');
}

export function choiceView(title, intro, options, page = 0) {
  const sliced = pageSlice(options, page, 6);
  const lines = [title, intro, ''];
  for (const option of sliced.items) {
    lines.push(`${option.label} — ${option.description || option.value}`);
  }
  if (sliced.pages > 1) lines.push('', `Страница ${sliced.page + 1} из ${sliced.pages}`);
  const rows = sliced.items.map((option, index) => [{
    text: String(option.label).slice(0, 40),
    data: `o:${sliced.start + index}`,
  }]);
  const pager = [];
  if (sliced.page > 0) pager.push({ text: 'Назад', data: `pg:${sliced.page - 1}` });
  if (sliced.page + 1 < sliced.pages) pager.push({ text: 'Дальше', data: `pg:${sliced.page + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: 'Отмена', data: 'o:cancel' }, { text: 'Меню', data: 'nav:menu' }]);
  return { text: lines.filter((line) => line !== undefined).join('\n'), keyboard: rows };
}

export function confirmKeyboard() {
  return [
    [{ text: 'Подтвердить', data: 'ok' }, { text: 'Отмена', data: 'no' }],
  ];
}

export function projectKeyboard(projects) {
  const rows = projects.slice(0, 20).map((project, index) => [{
    text: String(project.label || project.path).slice(0, 40),
    data: `p:${index}`,
  }]);
  rows.push([{ text: 'Ввести путь', data: 'nav:path' }, { text: 'Меню', data: 'nav:menu' }]);
  return rows;
}

export function modelKeyboard() {
  const rows = MODEL_PRESETS.map((preset) => [{
    text: preset.label,
    data: `model:${preset.id}`,
  }]);
  rows.push([{ text: 'Вручную', data: 'model:manual' }, { text: 'Каталог Pi', data: 'model:catalog' }]);
  rows.push([{ text: 'Меню', data: 'nav:menu' }]);
  return rows;
}

export function updateKeyboard() {
  return [
    ...UPDATE_ACTIONS.map((action) => [{ text: action.label, data: `upd:${action.id}` }]),
    [{ text: 'Меню', data: 'nav:menu' }],
  ];
}

export function backupKeyboard(backups) {
  const rows = [[{ text: 'Создать backup', data: 'bak:make' }]];
  backups.slice(0, 8).forEach((backup, index) => {
    rows.push([{ text: String(backup.name).slice(0, 40), data: `bak:${index}` }]);
  });
  rows.push([{ text: 'Меню', data: 'nav:menu' }]);
  return rows;
}

export function sessionKeyboard(files) {
  const rows = [[{ text: 'Продолжить последнюю', data: 'ses:last' }]];
  files.slice(0, 8).forEach((file, index) => {
    rows.push([{ text: String(file.name).slice(0, 40), data: `ses:${index}` }]);
  });
  rows.push([{ text: 'Меню', data: 'nav:menu' }]);
  return rows;
}
