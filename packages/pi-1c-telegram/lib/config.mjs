import fs from 'node:fs';
import path from 'node:path';

export const REFUSAL = 'Нет доступа к этому боту.';

export function telegramDir(profileDir) {
  return path.join(profileDir, 'state', 'telegram');
}

export function configPath(profileDir) {
  return path.join(telegramDir(profileDir), 'config.json');
}

export function tokenPath(profileDir) {
  return path.join(telegramDir(profileDir), 'bot.token');
}

export function emptyConfig() {
  return { allowedUserIds: [], allowedRoots: [], pins: [], recent: [] };
}

export function loadConfig(profileDir, { readFile = fs.readFileSync, exists = fs.existsSync } = {}) {
  const file = configPath(profileDir);
  if (!exists(file)) return emptyConfig();
  let data;
  try {
    data = JSON.parse(readFile(file, 'utf8'));
  } catch {
    throw new Error('state/telegram/config.json не разбирается как JSON.');
  }
  const base = emptyConfig();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return base;
  base.allowedUserIds = asIdList(data.allowedUserIds);
  base.allowedRoots = asStringList(data.allowedRoots);
  base.pins = asStringList(data.pins);
  base.recent = asStringList(data.recent);
  return base;
}

export function accessDecision(config, userId) {
  const list = asIdList(config?.allowedUserIds);
  if (!list.length) return { ok: false, reason: 'empty' };
  if (!list.includes(Number(userId))) return { ok: false, reason: 'unknown' };
  return { ok: true };
}

export function saveConfig(profileDir, config, { writeFile = fs.writeFileSync, mkdir = fs.mkdirSync, chmod = fs.chmodSync } = {}) {
  const dir = telegramDir(profileDir);
  mkdir(dir, { recursive: true });
  const file = configPath(profileDir);
  const body = {
    allowedUserIds: asIdList(config.allowedUserIds),
    allowedRoots: asStringList(config.allowedRoots),
    pins: asStringList(config.pins),
    recent: asStringList(config.recent).slice(0, 8),
  };
  writeFile(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  try { chmod(file, 0o600); } catch { /* windows */ }
  return file;
}

export function rememberRecent(config, projectPath) {
  const next = asStringList(config.recent).filter((item) => item !== projectPath);
  next.unshift(projectPath);
  return { ...config, recent: next.slice(0, 8) };
}

export function loadToken(profileDir, { readFile = fs.readFileSync, exists = fs.existsSync } = {}) {
  const file = tokenPath(profileDir);
  if (!exists(file)) return '';
  return String(readFile(file, 'utf8')).trim();
}

export function tightenTokenFile(file, { chmod = fs.chmodSync, exists = fs.existsSync } = {}) {
  if (!exists(file)) return false;
  try {
    chmod(file, 0o600);
    return true;
  } catch {
    return false;
  }
}

function asIdList(value) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const item of value) {
    const id = Number(item);
    if (Number.isInteger(id)) ids.push(id);
  }
  return ids;
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}
