import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  THINKING_LEVELS,
  applySettingsObject,
  authStatus,
  jsonValidate,
  listBackupFiles,
  listSessionFiles,
  packageVersion,
  parseModelCatalog,
  resolveBackupDir,
  resolveSessionDir,
  settingsGet,
} from '../../../scripts/lib/pi-1c-ctl-lib.mjs';

export const MODEL_PRESETS = Object.freeze([
  { id: '1', label: 'GPT-5.5', provider: 'openai-codex', model: 'gpt-5.5', level: 'high' },
  { id: '2', label: 'GPT-5.6 Luna', provider: 'openai-codex', model: 'gpt-5.6-luna', level: 'high' },
  { id: '3', label: 'GPT-5.6 Sol', provider: 'openai-codex', model: 'gpt-5.6-sol', level: 'high' },
  { id: '4', label: 'GPT-5.6 Terra', provider: 'openai-codex', model: 'gpt-5.6-terra', level: 'high' },
  { id: '5', label: 'GPT-5.4', provider: 'openai-codex', model: 'gpt-5.4', level: 'medium' },
  { id: '6', label: 'DeepSeek V4 Flash', provider: 'deepseek', model: 'deepseek-v4-flash', level: 'low' },
  { id: '7', label: 'DeepSeek V4 Pro', provider: 'deepseek', model: 'deepseek-v4-pro', level: 'high' },
  { id: 'R', label: 'RouterAI Flash', provider: 'routerai', model: 'deepseek/deepseek-v4-flash-0731', level: 'low' },
  { id: '8', label: 'Cursor Auto', provider: 'cursor', model: 'auto', level: '__REMOVE__' },
]);

export const UPDATE_ACTIONS = Object.freeze([
  { id: 'models', label: 'Каталоги моделей', args: ['update', '--models'] },
  { id: 'self', label: 'Pi CLI', args: ['update', '--self'] },
  { id: 'extensions', label: 'Пакеты', args: ['update', '--extensions'] },
  { id: 'all', label: 'Pi и пакеты', args: ['update', '--all'] },
]);

export function profilePaths(profileDir, env = process.env) {
  return {
    profileDir,
    settingsJson: path.join(profileDir, 'settings.json'),
    authJson: path.join(profileDir, 'auth.json'),
    sessionDir: resolveSessionDir({ profileDir, env }),
    backupDir: resolveBackupDir({ env }),
    packageDir: path.join(profileDir, 'packages', 'pi-1c-agent'),
  };
}

export function formatStatus(paths, { piVersion = '?' } = {}) {
  const sessions = listSessionFiles(paths.sessionDir);
  const provider = settingsGet(paths.settingsJson, 'defaultProvider') || '?';
  const model = settingsGet(paths.settingsJson, 'defaultModel') || '?';
  const thinking = settingsGet(paths.settingsJson, 'defaultThinkingLevel') || '(не задан)';
  const auth = authStatus(paths.authJson);
  return [
    `Профиль: ${paths.profileDir}`,
    `Сессии: ${paths.sessionDir}`,
    `Пакет: ${packageVersion(path.join(paths.packageDir, 'package.json'))}`,
    `Pi: ${piVersion}`,
    `Модель: ${provider} / ${model}`,
    `Thinking: ${thinking}`,
    `auth.json: ${auth.startsWith('есть') ? 'есть' : 'нет'}`,
    `Файлов сессий: ${sessions.length}; последняя: ${sessions[0]?.name || 'нет'}`,
  ].join('\n');
}

export function formatDiagnostics(paths, { piAvailable = false } = {}) {
  const lines = [];
  lines.push(jsonValidate(paths.settingsJson) ? 'OK settings.json валиден' : 'FAIL settings.json невалиден');
  lines.push(fs.existsSync(paths.authJson) ? 'OK auth.json найден' : 'WARN auth.json не найден');
  lines.push(piAvailable ? 'OK pi доступен' : 'FAIL pi недоступен');
  lines.push(fs.existsSync(paths.packageDir) ? 'OK пакет pi-1c-agent найден' : 'FAIL пакет не найден');
  lines.push(fs.existsSync(paths.sessionDir) ? 'OK каталог сессий найден' : 'FAIL каталог сессий не найден');
  return lines.join('\n');
}

export function parsePiModelList(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (!parts[0] || !parts[1]) return null;
      const thinking = parts.length >= 5 ? parts[parts.length - 2] : 'yes';
      return {
        provider: parts[0],
        model: parts[1],
        thinking: thinking === 'no' ? 'no' : 'yes',
      };
    })
    .filter(Boolean);
}

export function coerceThinking(level, supportsThinking = true) {
  const raw = String(level ?? '').trim().toLowerCase();
  if (supportsThinking === false || raw === 'no' || raw === 'нет' || raw === 'off' || raw === '__remove__') {
    return '__REMOVE__';
  }
  if (raw === 'yes' || raw === 'да' || raw === '' || raw === '__keep__') return '__KEEP__';
  if (THINKING_LEVELS.has(raw)) return raw;
  return '__KEEP__';
}

export function listModels(paths, { spawnImpl = spawnSyncCapture, piCmd = process.env.PI_CMD || 'pi' } = {}) {
  const result = spawnImpl(piCmd, ['--list-models'], {
    cwd: paths.profileDir,
    env: { ...process.env, PI_CODING_AGENT_DIR: paths.profileDir },
  });
  return parsePiModelList(result.stdout || '');
}

export function backupSettings(paths, reason = 'manual', { now = new Date(), fsImpl = fs } = {}) {
  if (!jsonValidate(paths.settingsJson)) {
    return { ok: false, message: 'settings.json невалиден — backup отменён.' };
  }
  fsImpl.mkdirSync(paths.backupDir, { recursive: true });
  try { fsImpl.chmodSync(paths.backupDir, 0o700); } catch { /* windows */ }
  const dst = path.join(paths.backupDir, `settings-${stamp(now)}-${reason}.json`);
  fsImpl.copyFileSync(paths.settingsJson, dst);
  try { fsImpl.chmodSync(dst, 0o600); } catch { /* windows */ }
  return { ok: true, path: dst, message: `Backup создан: ${dst}` };
}

export function applyModel(paths, { provider, model, level, thinking }, deps = {}) {
  level = coerceThinking(level, thinking !== 'no');
  if (!fs.existsSync(paths.settingsJson)) return { ok: false, message: 'Нет файла settings.json.' };
  if (!jsonValidate(paths.settingsJson)) {
    return { ok: false, message: 'Текущий settings.json невалиден. Изменение запрещено.' };
  }
  const before = fs.readFileSync(paths.settingsJson, 'utf8');
  const backed = backupSettings(paths, 'before-model-change', deps);
  if (!backed.ok) return backed;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(paths.settingsJson, 'utf8'));
  } catch {
    return { ok: false, message: 'Не удалось прочитать settings.json.' };
  }
  let next;
  try {
    next = applySettingsObject(data, provider, model, level);
  } catch (error) {
    return { ok: false, message: error.message };
  }
  const tmp = path.join(paths.profileDir, `.settings.json.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  if (!jsonValidate(tmp)) {
    fs.unlinkSync(tmp);
    return { ok: false, message: 'Временный settings.json не прошёл проверку.' };
  }
  try {
    fs.chmodSync(tmp, fs.statSync(paths.settingsJson).mode & 0o777);
  } catch {
    try { fs.chmodSync(tmp, 0o600); } catch { /* windows */ }
  }
  fs.renameSync(tmp, paths.settingsJson);
  if (!jsonValidate(paths.settingsJson)) {
    fs.writeFileSync(paths.settingsJson, before);
    return { ok: false, message: 'settings.json после записи невалиден. Файл возвращён.' };
  }
  const shown = level === '__REMOVE__' ? '(не задан)' : level;
  return { ok: true, message: `Настройки применены: provider=${provider}, model=${model}, thinking=${shown}` };
}

export function restoreSettings(paths, sourcePath, deps = {}) {
  if (!jsonValidate(sourcePath)) return { ok: false, message: 'Выбранный backup невалиден.' };
  if (fs.existsSync(paths.settingsJson)) {
    const backed = backupSettings(paths, 'before-restore', deps);
    if (!backed.ok) return backed;
  }
  const before = fs.existsSync(paths.settingsJson) ? fs.readFileSync(paths.settingsJson, 'utf8') : '';
  const tmp = path.join(paths.profileDir, `.settings.json.restore.${process.pid}.${Date.now()}`);
  fs.copyFileSync(sourcePath, tmp);
  if (!jsonValidate(tmp)) {
    fs.unlinkSync(tmp);
    return { ok: false, message: 'Временный файл restore невалиден.' };
  }
  try {
    fs.chmodSync(tmp, fs.existsSync(paths.settingsJson) ? (fs.statSync(paths.settingsJson).mode & 0o777) : 0o600);
  } catch {
    try { fs.chmodSync(tmp, 0o600); } catch { /* windows */ }
  }
  fs.renameSync(tmp, paths.settingsJson);
  if (!jsonValidate(paths.settingsJson)) {
    if (before) fs.writeFileSync(paths.settingsJson, before);
    return { ok: false, message: 'settings.json невалиден после restore.' };
  }
  return { ok: true, message: 'settings.json восстановлен.' };
}

export function sessionEntries(paths) {
  return listSessionFiles(paths.sessionDir).map((file) => ({
    name: file.name,
    path: path.join(paths.sessionDir, file.name),
  }));
}

export function backupEntries(paths) {
  return listBackupFiles(paths.backupDir);
}

export function runPi(paths, args, { spawnImpl = spawnSyncCapture, piCmd = process.env.PI_CMD || 'pi' } = {}) {
  return spawnImpl(piCmd, args, {
    cwd: paths.profileDir,
    env: { ...process.env, PI_CODING_AGENT_DIR: paths.profileDir },
  });
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function spawnSyncCapture(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}
