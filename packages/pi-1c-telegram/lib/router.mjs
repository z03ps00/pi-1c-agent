import { INIT_MODE, OVERLAYS, parseIncoming } from './choices.mjs';
import { REFUSAL } from './config.mjs';
import { isPathText } from './projects.mjs';
import { MODEL_PRESETS, UPDATE_ACTIONS } from './panel.mjs';
import {
  backupKeyboard,
  choiceView,
  confirmKeyboard,
  homeKeyboard,
  homeText,
  modelKeyboard,
  projectKeyboard,
  sessionKeyboard,
  updateKeyboard,
} from './menus.mjs';

export function initialChat() {
  return {
    project: null,
    mode: 'ask',
    approve: 'off',
    busy: false,
    dialog: null,
    awaitText: null,
    pendingText: null,
    projectChoices: [],
    sessionFiles: [],
    backups: [],
    catalog: [],
    catalogPage: 0,
    manual: null,
  };
}

export function decide(state, event, ctx = {}) {
  const next = clone(state);
  const effects = [];
  if (event.allowed === false) {
    effects.push(reply(REFUSAL));
    return { state: next, effects };
  }
  if (event.type === 'callback') return onCallback(next, event.data, effects, ctx);
  if (event.type === 'text') return onText(next, event.text, effects, ctx);
  return { state: next, effects };
}

function onText(state, text, effects, ctx) {
  if (state.dialog && state.dialog.kind !== 'input' && state.dialog.kind !== 'editor') {
    if (parseIncoming(text).kind === 'local' && parseIncoming(text).name === 'cancel') {
      return cancelCurrent(state, effects);
    }
    effects.push(reply('Сначала закончите выбор или нажмите отмену.'));
    return { state, effects };
  }
  if (state.dialog && (state.dialog.kind === 'input' || state.dialog.kind === 'editor')) {
    const parsedInput = parseIncoming(text);
    if (parsedInput.kind === 'local' && parsedInput.name === 'cancel') return cancelCurrent(state, effects);
    const value = String(text ?? '');
    state.dialog = null;
    effects.push({ type: 'resolve-pi', answer: { value } });
    return { state, effects };
  }
  if (state.awaitText === 'catalog-level') {
    const levelRaw = String(text ?? '').trim().toLowerCase();
    const level = levelRaw === '' ? '__KEEP__' : levelRaw;
    const manual = state.manual || {};
    state.awaitText = null;
    state.manual = null;
    effects.push({ type: 'panel', op: 'apply-model', provider: manual.provider, model: manual.model, level });
    return { state, effects };
  }
  if (state.awaitText === 'path') {
    state.awaitText = null;
    return takePath(state, text, effects, ctx);
  }
  if (state.awaitText === 'manual-provider') {
    state.manual = { provider: String(text ?? '').trim() };
    state.awaitText = 'manual-model';
    effects.push(reply('Model:'));
    return { state, effects };
  }
  if (state.awaitText === 'manual-model') {
    state.manual = { ...state.manual, model: String(text ?? '').trim() };
    state.awaitText = 'manual-level';
    effects.push(reply('Thinking level (off, minimal, low, medium, high, xhigh, max). Пустое сообщение снимет thinking.'));
    return { state, effects };
  }
  if (state.awaitText === 'manual-level') {
    const levelRaw = String(text ?? '').trim().toLowerCase();
    const level = levelRaw === '' ? '__REMOVE__' : levelRaw === 'keep' ? '__KEEP__' : levelRaw;
    const manual = state.manual || {};
    state.awaitText = null;
    state.manual = null;
    if (!manual.provider || !manual.model) {
      effects.push(reply('provider и model обязательны.'));
      return { state, effects };
    }
    effects.push({ type: 'panel', op: 'apply-model', provider: manual.provider, model: manual.model, level });
    return { state, effects };
  }
  if (state.busy) {
    const parsedBusy = parseIncoming(text);
    if (parsedBusy.kind === 'local' && parsedBusy.name === 'cancel') return cancelCurrent(state, effects);
    if (parsedBusy.path || isPathText(parsedBusy.text || text)) return takePath(state, parsedBusy.text || text, effects, ctx);
    effects.push(reply('Сессия занята. Дождитесь ответа или отправьте /cancel.'));
    return { state, effects };
  }
  const parsed = parseIncoming(text);
  if (parsed.kind === 'local') return onLocal(state, parsed, effects, ctx);
  if (parsed.kind === 'overlay') return openOverlay(state, parsed.name, effects, ctx);
  if (parsed.path || isPathText(parsed.text || text)) return takePath(state, parsed.text || text, effects, ctx);
  if (parsed.kind === 'agent') {
    const mode = parsed.raw.match(/^\/mode\s+(ask|plan|build)\b/);
    const approve = parsed.raw.match(/^\/approve\s+(off|safe|strict)\b/);
    return sendAgent(state, parsed.raw, effects, ctx, {
      mode: mode?.[1],
      approve: approve?.[1],
    });
  }
  if (parsed.kind === 'text') return sendAgent(state, parsed.text, effects, ctx);
  effects.push(reply(homeText(state), homeKeyboard()));
  return { state, effects };
}

function onCallback(state, data, effects, ctx) {
  const key = String(data ?? '');
  if (key === 'o:cancel' || key === 'no') {
    const purpose = state.dialog?.purpose;
    if (purpose === 'switch' || purpose === 'restore' || purpose === 'update') {
      state.dialog = null;
      effects.push(reply('Отмена.'));
      return { state, effects };
    }
    return cancelCurrent(state, effects);
  }
  if (key === 'nav:menu' || key === 'nav:start') {
    state.dialog = null;
    state.awaitText = null;
    effects.push(reply(homeText(state), homeKeyboard()));
    return { state, effects };
  }
  if (state.dialog?.kind === 'select' && key.startsWith('pg:')) {
    state.dialog = { ...state.dialog, page: Number(key.slice(3)) || 0 };
    effects.push(overlayReply(state.dialog));
    return { state, effects };
  }
  if (state.dialog?.kind === 'select' && key.startsWith('o:')) {
    const option = state.dialog.options[Number(key.slice(2))];
    if (!option) return { state, effects };
    return applyOption(state, option, effects);
  }
  if (state.dialog?.kind === 'confirm' && key === 'ok') return applyConfirm(state, effects);
  if (key === 'nav:status') {
    effects.push({ type: 'panel', op: 'status' });
    return { state, effects };
  }
  if (key === 'nav:diag') {
    effects.push({ type: 'panel', op: 'diagnostics' });
    return { state, effects };
  }
  if (key === 'nav:new') return newChat(state, effects);
  if (key === 'nav:project') return showProjects(state, effects, ctx);
  if (key === 'nav:path') {
    state.awaitText = 'path';
    effects.push(reply('Пришлите путь к каталогу проекта.'));
    return { state, effects };
  }
  if (key.startsWith('p:')) {
    const chosen = state.projectChoices[Number(key.slice(2))];
    if (!chosen) return { state, effects };
    return takePath(state, chosen.path, effects, ctx);
  }
  if (key === 'nav:sessions') {
    effects.push({ type: 'panel', op: 'sessions' });
    return { state, effects };
  }
  if (key === 'ses:last') {
    effects.push({ type: 'open', cwd: state.project, resume: 'continue' });
    effects.push(reply('Продолжаю последнюю сессию.'));
    return { state, effects };
  }
  if (key.startsWith('ses:')) {
    const file = state.sessionFiles[Number(key.slice(4))];
    if (!file) return { state, effects };
    effects.push({ type: 'open', cwd: state.project, resume: 'session', sessionFile: file.path });
    effects.push(reply(`Сессия: ${file.name}`));
    return { state, effects };
  }
  if (key === 'nav:model') {
    effects.push(reply('Модель и thinking.', modelKeyboard()));
    return { state, effects };
  }
  if (key.startsWith('model:')) return pickModel(state, key.slice(6), effects);
  if (key === 'nav:backup') {
    effects.push({ type: 'panel', op: 'backups' });
    return { state, effects };
  }
  if (key === 'bak:make') {
    effects.push({ type: 'panel', op: 'backup' });
    return { state, effects };
  }
  if (key.startsWith('bak:')) {
    const backup = state.backups[Number(key.slice(4))];
    if (!backup) return { state, effects };
    state.dialog = { kind: 'confirm', purpose: 'restore', backup };
    effects.push(reply(`Восстановить ${backup.name}? Текущий settings.json будет предварительно сохранён.`, confirmKeyboard()));
    return { state, effects };
  }
  if (key === 'nav:update') {
    effects.push(reply('Обновление Pi. Нужно отдельное подтверждение.', updateKeyboard()));
    return { state, effects };
  }
  if (key.startsWith('upd:')) {
    const action = UPDATE_ACTIONS.find((item) => item.id === key.slice(4));
    if (!action) return { state, effects };
    state.dialog = { kind: 'confirm', purpose: 'update', action };
    effects.push(reply(`Подтвердить обновление: ${action.label}?`, confirmKeyboard()));
    return { state, effects };
  }
  if (key === 'nav:safe') return sendAgent(state, '/approve safe', effects, ctx, { approve: 'safe' });
  if (key.startsWith('cat:')) {
    const index = Number(key.slice(4));
    const entry = state.catalog[index];
    if (!entry) return { state, effects };
    state.awaitText = 'catalog-level';
    state.manual = { provider: entry.provider, model: entry.model };
    effects.push(reply(`Thinking для ${entry.provider} / ${entry.model}. Пустое сообщение оставит текущий.`));
    return { state, effects };
  }
  return { state, effects };
}

function onLocal(state, parsed, effects, ctx) {
  if (parsed.name === 'start' || parsed.name === 'help' || parsed.name === 'menu') {
    effects.push(reply(homeText(state), homeKeyboard()));
    return { state, effects };
  }
  if (parsed.name === 'status') {
    effects.push({ type: 'panel', op: 'status' });
    return { state, effects };
  }
  if (parsed.name === 'project') return showProjects(state, effects, ctx);
  if (parsed.name === 'cancel') return cancelCurrent(state, effects);
  return { state, effects };
}

function openOverlay(state, name, effects, ctx) {
  if (!state.project) return askProject(state, effects, ctx, `/${name}`);
  const overlay = OVERLAYS[name];
  state.dialog = {
    kind: 'select',
    source: 'menu',
    purpose: 'overlay',
    command: name,
    title: `/${name}`,
    intro: overlay.intro,
    options: overlay.choices,
    page: 0,
  };
  effects.push(overlayReply(state.dialog));
  return { state, effects };
}

function overlayReply(dialog) {
  const view = choiceView(dialog.title, dialog.intro, dialog.options, dialog.page);
  return reply(view.text, view.keyboard);
}

function applyOption(state, option, effects) {
  const dialog = state.dialog;
  state.dialog = null;
  if (dialog.source === 'pi') {
    effects.push({ type: 'resolve-pi', answer: { value: option.value } });
    return { state, effects };
  }
  if (dialog.purpose === 'init-mode') {
    return sendAgent(state, `/init empty ${option.value}`, effects, {});
  }
  if (dialog.command === 'init' && option.value === 'empty') {
    state.dialog = {
      kind: 'select',
      source: 'menu',
      purpose: 'init-mode',
      command: 'init',
      title: '/init',
      intro: INIT_MODE.intro,
      options: INIT_MODE.choices,
      page: 0,
    };
    effects.push(overlayReply(state.dialog));
    return { state, effects };
  }
  if (dialog.command === 'init') return sendAgent(state, `/init ${option.value}`, effects, {});
  const patch = {};
  if (dialog.command === 'mode') patch.mode = option.value;
  if (dialog.command === 'approve') patch.approve = option.value;
  return sendAgent(state, `/${dialog.command} ${option.value}`, effects, {}, patch);
}

function applyConfirm(state, effects) {
  const dialog = state.dialog;
  state.dialog = null;
  if (!dialog) return { state, effects };
  if (dialog.source === 'pi' || dialog.purpose === 'pi-confirm') {
    effects.push({ type: 'resolve-pi', answer: { confirmed: true } });
    return { state, effects };
  }
  if (dialog.purpose === 'restore') {
    effects.push({ type: 'panel', op: 'restore', backup: dialog.backup });
    return { state, effects };
  }
  if (dialog.purpose === 'update') {
    effects.push({ type: 'panel', op: 'update', action: dialog.action });
    return { state, effects };
  }
  if (dialog.purpose === 'switch') {
    effects.push({ type: 'abort' });
    effects.push({ type: 'close' });
    state.busy = false;
    return bindProject(state, dialog.path, effects);
  }
  return { state, effects };
}

function cancelCurrent(state, effects) {
  const dialog = state.dialog;
  state.dialog = null;
  state.awaitText = null;
  if (dialog?.source === 'pi' || dialog?.purpose === 'pi-confirm') {
    effects.push({ type: 'resolve-pi', answer: { cancelled: true } });
  }
  if (state.busy) {
    effects.push({ type: 'abort' });
    state.busy = false;
    effects.push(reply('Ход остановлен.'));
    return { state, effects };
  }
  effects.push(reply('Отмена.'));
  return { state, effects };
}

function sendAgent(state, text, effects, ctx = {}, patch = {}) {
  if (!state.project) return askProject(state, effects, ctx, text);
  if (patch.mode) state.mode = patch.mode;
  if (patch.approve) state.approve = patch.approve;
  state.busy = true;
  effects.push({ type: 'prompt', text });
  return { state, effects };
}

function askProject(state, effects, ctx, pending) {
  state.pendingText = pending;
  state.projectChoices = Array.isArray(ctx?.projects) ? ctx.projects : state.projectChoices;
  effects.push(reply('Сначала выберите проект.', projectKeyboard(state.projectChoices)));
  return { state, effects };
}

function newChat(state, effects) {
  if (!state.project) return askProject(state, effects, {}, null);
  state.mode = 'ask';
  state.busy = false;
  state.dialog = null;
  effects.push({ type: 'close' });
  effects.push({ type: 'open', cwd: state.project, resume: 'fresh' });
  effects.push(reply('Новый чат в режиме ask.', homeKeyboard()));
  return { state, effects };
}

function showProjects(state, effects, ctx) {
  state.projectChoices = Array.isArray(ctx.projects) ? ctx.projects : [];
  const lines = state.projectChoices.length
    ? 'Выберите каталог или пришлите путь.'
    : 'Закреплённых каталогов нет. Пришлите путь.';
  effects.push(reply(lines, projectKeyboard(state.projectChoices)));
  return { state, effects };
}

function takePath(state, raw, effects, ctx) {
  const resolved = ctx.resolvePath ? ctx.resolvePath(raw) : { ok: false, reason: 'missing' };
  if (!resolved.ok) {
    effects.push(reply(resolved.reason === 'outside' ? 'Каталог вне разрешённых корней.' : 'Каталог не найден.'));
    return { state, effects };
  }
  if (state.busy && state.project && state.project !== resolved.path) {
    state.dialog = { kind: 'confirm', purpose: 'switch', path: resolved.path, source: 'menu' };
    effects.push(reply(`Сменить проект на ${resolved.path}? Текущий ответ будет остановлен.`, confirmKeyboard()));
    return { state, effects };
  }
  return bindProject(state, resolved.path, effects);
}

function bindProject(state, projectPath, effects) {
  state.project = projectPath;
  effects.push({ type: 'remember', path: projectPath });
  effects.push({ type: 'close' });
  effects.push({ type: 'open', cwd: projectPath, resume: 'fresh' });
  if (state.pendingText) {
    const pending = state.pendingText;
    state.pendingText = null;
    if (pending.startsWith('/') && !parseIncoming(pending).raw?.includes(' ') && OVERLAYS[pending.slice(1)]) {
      return openOverlay(state, pending.slice(1), effects);
    }
    state.busy = true;
    effects.push({ type: 'prompt', text: pending });
  }
  effects.push(reply(homeText(state), homeKeyboard()));
  return { state, effects };
}

function pickModel(state, id, effects) {
  if (id === 'manual') {
    state.awaitText = 'manual-provider';
    state.manual = {};
    effects.push(reply('Provider:'));
    return { state, effects };
  }
  if (id === 'catalog') {
    effects.push({ type: 'panel', op: 'catalog' });
    return { state, effects };
  }
  const preset = MODEL_PRESETS.find((item) => item.id === id);
  if (!preset) return { state, effects };
  effects.push({
    type: 'panel',
    op: 'apply-model',
    provider: preset.provider,
    model: preset.model,
    level: preset.level,
  });
  return { state, effects };
}

function reply(text, keyboard = null) {
  return { type: 'reply', text, keyboard };
}

function clone(state) {
  return {
    ...state,
    dialog: state.dialog ? { ...state.dialog } : null,
    manual: state.manual ? { ...state.manual } : null,
    projectChoices: [...(state.projectChoices || [])],
    sessionFiles: [...(state.sessionFiles || [])],
    backups: [...(state.backups || [])],
    catalog: [...(state.catalog || [])],
  };
}

export function projectList(config) {
  const pins = (config?.pins || []).map((item) => ({ label: item, path: item }));
  const recent = (config?.recent || [])
    .filter((item) => !(config?.pins || []).includes(item))
    .map((item) => ({ label: item, path: item }));
  return [...pins, ...recent];
}

export { backupKeyboard, sessionKeyboard };
