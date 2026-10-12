import { accessDecision } from './config.mjs';
import { chunkText, redactOutgoing } from './format.mjs';
import { choiceView, confirmKeyboard, sessionKeyboard, backupKeyboard } from './menus.mjs';
import {
  applyModel,
  backupEntries,
  backupSettings,
  formatDiagnostics,
  formatStatus,
  listModels,
  profilePaths,
  restoreSettings,
  runPi,
  sessionEntries,
} from './panel.mjs';
import { acceptProject } from './projects.mjs';
import { createRpcSession } from './rpc-session.mjs';
import { decide, initialChat, projectList } from './router.mjs';
import { rememberRecent, saveConfig } from './config.mjs';

export function eventFromUpdate(update) {
  const query = update?.callback_query;
  if (query) {
    return {
      type: 'callback',
      data: String(query.data ?? ''),
      userId: query.from?.id,
      chatId: query.message?.chat?.id,
      callbackId: query.id,
    };
  }
  const message = update?.message;
  if (typeof message?.text === 'string') {
    return {
      type: 'text',
      text: message.text,
      userId: message.from?.id,
      chatId: message.chat?.id,
    };
  }
  return null;
}

export function createGateway({
  profileDir,
  config,
  api,
  paths = profilePaths(profileDir),
  openSession = createRpcSession,
  piVersion = '?',
} = {}) {
  const chats = new Map();
  const sessions = new Map();
  const resolvers = new Map();
  let liveConfig = config;
  let opened = 0;

  function stateFor(chatId) {
    if (!chats.has(chatId)) chats.set(chatId, initialChat());
    return chats.get(chatId);
  }

  function context() {
    return {
      projects: projectList(liveConfig),
      resolvePath(raw) {
        return acceptProject(raw, { roots: liveConfig.allowedRoots || [] });
      },
    };
  }

  async function handleUpdate(update) {
    const event = eventFromUpdate(update);
    if (!event || event.chatId == null) return;
    if (event.callbackId) await api.answerCallback(event.callbackId);
    const access = accessDecision(liveConfig, event.userId);
    const result = decide(stateFor(event.chatId), { ...event, allowed: access.ok }, context());
    chats.set(event.chatId, result.state);
    await runEffects(event.chatId, result.effects);
  }

  async function runEffects(chatId, effects) {
    for (const effect of effects) {
      if (effect.type === 'reply') await deliver(chatId, effect.text, effect.keyboard);
      else if (effect.type === 'remember') remember(effect.path);
      else if (effect.type === 'close') closeSession(chatId);
      else if (effect.type === 'open') open(chatId, effect);
      else if (effect.type === 'abort') await sessions.get(chatId)?.session.cancel?.();
      else if (effect.type === 'prompt') await runPrompt(chatId, effect.text);
      else if (effect.type === 'resolve-pi') resolvePi(chatId, effect.answer);
      else if (effect.type === 'panel') await runPanel(chatId, effect);
    }
  }

  function remember(projectPath) {
    liveConfig = rememberRecent(liveConfig, projectPath);
    saveConfig(profileDir, liveConfig);
  }

  function closeSession(chatId) {
    sessions.get(chatId)?.session.stop?.();
    sessions.delete(chatId);
  }

  function open(chatId, effect) {
    closeSession(chatId);
    const cwd = effect.cwd || profileDir;
    const slot = { parts: [], streamed: false, session: null };
    slot.session = openSession({
      cwd,
      profileDir,
      resume: effect.resume || 'fresh',
      sessionFile: effect.sessionFile || '',
      onDialog: (request) => piDialog(chatId, request),
      onEvent: (message) => noteEvent(chatId, slot, message),
    });
    sessions.set(chatId, slot);
    opened += 1;
  }

  function noteEvent(chatId, slot, message) {
    const delta = message?.assistantMessageEvent;
    if (message?.type === 'message_update' && delta?.type === 'text_delta' && delta.delta) {
      slot.streamed = true;
      slot.parts.push(String(delta.delta));
      return;
    }
    if (message?.type === 'message_end' && message.message?.role === 'assistant' && !slot.streamed) {
      const text = textOf(message.message.content);
      if (text) slot.parts.push(text);
      return;
    }
    if (message?.type === 'tool_execution_start') {
      void deliver(chatId, `Инструмент ${message.toolName || 'tool'}: старт`);
    } else if (message?.type === 'tool_execution_end') {
      void deliver(chatId, `Инструмент ${message.toolName || 'tool'}: ${message.isError ? 'ошибка' : 'готово'}`);
    }
  }

  async function runPrompt(chatId, text) {
    const state = stateFor(chatId);
    if (!sessions.has(chatId)) open(chatId, { cwd: state.project || profileDir, resume: 'fresh' });
    const slot = sessions.get(chatId);
    slot.parts = [];
    slot.streamed = false;
    try {
      await slot.session.prompt(text);
      const full = slot.parts.join('');
      if (full) await deliver(chatId, full, null, state.project);
    } catch (error) {
      await deliver(chatId, `Ошибка сессии: ${error.message}`);
    } finally {
      state.busy = false;
    }
  }

  function resolvePi(chatId, answer) {
    const resolve = resolvers.get(chatId);
    resolvers.delete(chatId);
    if (resolve) resolve(answer);
  }

  function piDialog(chatId, request) {
    const state = stateFor(chatId);
    return new Promise((resolve) => {
      resolvers.set(chatId, resolve);
      if (request.method === 'confirm') {
        state.dialog = { kind: 'confirm', source: 'pi', purpose: 'pi-confirm' };
        void deliver(chatId, [request.title, request.message].filter(Boolean).join('\n') || 'Подтверждение', confirmKeyboard());
        return;
      }
      if (request.method === 'input' || request.method === 'editor') {
        state.dialog = { kind: request.method, source: 'pi' };
        void deliver(chatId, request.title || 'Введите текст. /cancel отменяет ввод.');
        return;
      }
      const options = normalizeOptions(request.options);
      state.dialog = {
        kind: 'select',
        source: 'pi',
        title: request.title || 'Выбор',
        intro: '',
        options,
        page: 0,
      };
      const view = choiceView(state.dialog.title, '', options, 0);
      void deliver(chatId, view.text, view.keyboard);
    });
  }

  async function runPanel(chatId, effect) {
    const state = stateFor(chatId);
    if (effect.op === 'status') {
      await deliver(chatId, formatStatus(paths, { piVersion }));
      return;
    }
    if (effect.op === 'diagnostics') {
      await deliver(chatId, formatDiagnostics(paths, { piAvailable: piVersion !== '?' }));
      return;
    }
    if (effect.op === 'apply-model') {
      const result = applyModel(paths, effect);
      await deliver(chatId, result.message);
      return;
    }
    if (effect.op === 'backup') {
      const result = backupSettings(paths, 'manual');
      await deliver(chatId, result.message);
      return;
    }
    if (effect.op === 'backups') {
      state.backups = backupEntries(paths);
      const text = state.backups.length ? 'Backup settings.json' : 'Backup-файлов нет.';
      await deliver(chatId, text, backupKeyboard(state.backups));
      return;
    }
    if (effect.op === 'restore') {
      const result = restoreSettings(paths, effect.backup.full || effect.backup.path);
      await deliver(chatId, result.message);
      return;
    }
    if (effect.op === 'update') {
      const result = runPi(paths, effect.action.args);
      const text = [result.stdout, result.stderr].filter(Boolean).join('\n') || `Код ${result.code}`;
      await deliver(chatId, text);
      return;
    }
    if (effect.op === 'sessions') {
      state.sessionFiles = sessionEntries(paths);
      const text = state.sessionFiles.length ? 'Сессии' : 'Сессий нет.';
      await deliver(chatId, text, sessionKeyboard(state.sessionFiles));
      return;
    }
    if (effect.op === 'catalog') {
      state.catalog = listModels(paths);
      const rows = state.catalog.slice(0, 20).map((entry, index) => [{
        text: `${entry.provider} / ${entry.model}`.slice(0, 40),
        data: `cat:${index}`,
      }]);
      rows.push([{ text: 'Меню', data: 'nav:menu' }]);
      const text = state.catalog.length ? 'Каталог моделей' : 'Каталог моделей пуст.';
      await deliver(chatId, text, rows);
    }
  }

  async function deliver(chatId, text, keyboard = null, cwd = profileDir) {
    const clean = redactOutgoing(text, cwd).text;
    const chunks = chunkText(clean);
    if (!chunks.length) return;
    for (let index = 0; index < chunks.length; index += 1) {
      await api.sendMessage(chatId, chunks[index], index === 0 ? keyboard : null);
    }
  }

  return {
    handleUpdate,
    chats,
    get opened() { return opened; },
  };
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option, index) => {
    if (option && typeof option === 'object') {
      const value = option.value ?? option.label ?? String(index);
      return {
        value: String(value),
        label: String(option.label ?? value),
        description: String(option.description || ''),
      };
    }
    return { value: String(option), label: String(option), description: '' };
  });
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && part.type === 'text' && part.text)
    .map((part) => String(part.text))
    .join('\n');
}
