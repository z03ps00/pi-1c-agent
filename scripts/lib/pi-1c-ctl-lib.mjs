import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const THINKING_LEVELS = new Set(['__KEEP__', '__REMOVE__', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

export function resolveProfileDir({ env = process.env, scriptDir } = {}) {
  const fromEnv = String(env.PI_CODING_AGENT_DIR ?? '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(scriptDir, '..');
}

export function resolveSessionDir({ env = process.env, profileDir, homedir = os.homedir() } = {}) {
  const fromEnv = String(env.PI_CODING_AGENT_SESSION_DIR ?? '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const inProfile = path.join(profileDir, 'sessions');
  if (fs.existsSync(inProfile)) return inProfile;
  return path.join(homedir, '.pi', 'agent', 'sessions');
}

export function resolveBackupDir({ env = process.env, homedir = os.homedir() } = {}) {
  const fromEnv = String(env.PI_1C_BACKUP_DIR ?? '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(homedir, 'pi-1c-backups');
}

export function expandProjectPath(raw, { homedir = os.homedir() } = {}) {
  let project = String(raw ?? '');
  if (
    (project.startsWith('"') && project.endsWith('"') && project.length >= 2)
    || (project.startsWith("'") && project.endsWith("'") && project.length >= 2)
  ) {
    project = project.slice(1, -1);
  }
  if (project === '~') return homedir;
  if (project.startsWith('~/') || project.startsWith('~\\')) {
    return homedir + project.slice(1);
  }
  return project;
}

export function jsonValidate(filePath) {
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

export function settingsGet(filePath, key) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const value = data?.[key];
    return value == null ? '' : String(value);
  } catch {
    return '';
  }
}

export function applySettingsObject(data, provider, model, level) {
  if (!THINKING_LEVELS.has(level)) {
    throw new Error(`Недопустимый thinking level: ${level}`);
  }
  const next = { ...data };
  next.defaultProvider = provider;
  next.defaultModel = model;
  if (level === '__REMOVE__') delete next.defaultThinkingLevel;
  else if (level !== '__KEEP__') next.defaultThinkingLevel = level;
  return next;
}

export function parseModelCatalog(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (!parts[0]) return null;
      return { provider: parts[0], model: parts[1] || '' };
    })
    .filter(Boolean);
}

export function listSessionFiles(sessionDir, { max = 20 } = {}) {
  if (!sessionDir || !fs.existsSync(sessionDir)) return [];
  return fs.readdirSync(sessionDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => {
      const full = path.join(sessionDir, name);
      const st = fs.statSync(full);
      return { name, mtime: st.mtimeMs, stamp: formatStamp(st.mtime) };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, max);
}

function formatStamp(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function listBackupFiles(backupDir, { max = 20 } = {}) {
  if (!backupDir || !fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((name) => /^settings-.*\.json$/.test(name))
    .map((name) => {
      const full = path.join(backupDir, name);
      return { name, full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, max);
}

export function packageVersion(packageJsonPath) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version || '?';
  } catch {
    return '?';
  }
}

export function authStatus(authPath) {
  try {
    const st = fs.statSync(authPath);
    const mode = (st.mode & 0o777).toString(8);
    return `есть (${mode}, ${st.size} bytes)`;
  } catch {
    return 'нет';
  }
}
