import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { saveConfig, telegramDir } from './config.mjs';
import { acceptProject } from './projects.mjs';

const PAIR_MS = 10 * 60 * 1000;

export function pairingPath(profileDir) {
  return path.join(telegramDir(profileDir), 'pairing.json');
}

export function statusText({ config, token = '', running = false } = {}) {
  const secret = String(token ?? '').trim();
  const tokenLine = secret
    ? `Токен: задан (…${secret.slice(-4)})`
    : 'Токен: не задан';
  const ids = config?.allowedUserIds || [];
  const roots = config?.allowedRoots || [];
  const pins = config?.pins || [];
  return [
    tokenLine,
    `Допуск: ${ids.length ? ids.join(', ') : 'нет'}`,
    `Корни: ${roots.length ? roots.join('\n') : 'нет'}`,
    `Проекты: ${pins.length ? pins.join('\n') : 'нет'}`,
    `Процесс: ${running ? 'запущен' : 'остановлен'}`,
  ].join('\n');
}

export function writeToken(profileDir, raw, { writeFile = fs.writeFileSync, mkdir = fs.mkdirSync, chmod = fs.chmodSync } = {}) {
  const token = String(raw ?? '').trim();
  if (!token || /\s/.test(token)) return { ok: false, message: 'Токен пустой или содержит пробел.' };
  const dir = telegramDir(profileDir);
  mkdir(dir, { recursive: true });
  const file = path.join(dir, 'bot.token');
  writeFile(file, `${token}\n`, { mode: 0o600 });
  try { chmod(file, 0o600); } catch { /* windows */ }
  return { ok: true, message: `Токен записан (…${token.slice(-4)}).` };
}

export function setAllowedUser(config, raw) {
  const id = Number(String(raw ?? '').trim());
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Нужен числовой Telegram id.' };
  const ids = [...(config.allowedUserIds || [])];
  if (!ids.includes(id)) ids.push(id);
  return { ok: true, config: { ...config, allowedUserIds: ids }, message: `Допуск: ${id}.` };
}

export function addRoot(config, raw, { exists = fs.existsSync, stat = fs.statSync, realpath = fs.realpathSync } = {}) {
  const expanded = String(raw ?? '').trim();
  if (!expanded || !exists(expanded)) return { ok: false, message: 'Каталог не найден.' };
  try {
    if (!stat(expanded).isDirectory()) return { ok: false, message: 'Это не каталог.' };
  } catch {
    return { ok: false, message: 'Каталог не найден.' };
  }
  let real;
  try { real = realpath(expanded); } catch { return { ok: false, message: 'Каталог не найден.' }; }
  const roots = [...(config.allowedRoots || [])];
  if (!roots.includes(real)) roots.push(real);
  return { ok: true, config: { ...config, allowedRoots: roots }, path: real, message: `Корень: ${real}` };
}

export function pinChoiceLabel(pinPath) {
  const base = path.basename(pinPath);
  const parent = path.basename(path.dirname(pinPath));
  return parent && parent !== base ? `${parent} / ${base}` : base;
}

export function formatPins(config) {
  const pins = config?.pins || [];
  if (!pins.length) return 'Закреплённых путей нет.';
  return pins.map((item, index) => `${index + 1}. ${pinChoiceLabel(item)}\n${item}`).join('\n');
}

export function pinPath(config, raw) {
  const expanded = String(raw ?? '').trim();
  const parent = path.dirname(expanded);
  const rooted = addRoot(config, parent);
  const next = rooted.ok ? rooted.config : config;
  const self = rooted.ok ? null : addRoot(next, expanded);
  if (!rooted.ok && !self?.ok) return self || rooted;
  return addPin(self?.config || next, expanded);
}

export function removePin(config, raw) {
  const wanted = String(raw ?? '').trim();
  const pins = [...(config?.pins || [])];
  const target = pins.find((item) => item === wanted || pinChoiceLabel(item) === wanted || path.basename(item) === wanted);
  if (!target) return { ok: false, message: 'Такого закрепления нет.' };
  return {
    ok: true,
    config: { ...config, pins: pins.filter((item) => item !== target) },
    message: `Убрано: ${target}`,
  };
}

export function addPin(config, raw) {
  const accepted = acceptProject(raw, { roots: config.allowedRoots || [] });
  if (!accepted.ok) {
    return {
      ok: false,
      message: accepted.reason === 'outside' ? 'Каталог вне разрешённых корней.' : 'Каталог не найден.',
    };
  }
  const pins = [...(config.pins || [])];
  if (!pins.includes(accepted.path)) pins.push(accepted.path);
  return { ok: true, config: { ...config, pins }, path: accepted.path, message: `Проект: ${accepted.path}` };
}

export function useHere(config, cwd) {
  const rooted = addRoot(config, cwd);
  if (!rooted.ok) return rooted;
  const pinned = addPin(rooted.config, rooted.path);
  if (!pinned.ok) return { ...rooted, message: rooted.message };
  return { ok: true, config: pinned.config, message: `Текущий каталог закреплён:\n${pinned.path}` };
}

export function createPairing(profileDir, now = Date.now(), deps = {}) {
  const code = String(randomInt(100000, 1000000));
  const record = { code, expires: now + PAIR_MS };
  const dir = telegramDir(profileDir);
  (deps.mkdir || fs.mkdirSync)(dir, { recursive: true });
  const file = pairingPath(profileDir);
  (deps.writeFile || fs.writeFileSync)(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  try { (deps.chmod || fs.chmodSync)(file, 0o600); } catch { /* windows */ }
  return { code, expires: record.expires, message: `Откройте бота и отправьте код ${code}. Код действует 10 минут.` };
}

export function loadPairing(profileDir, now = Date.now(), { readFile = fs.readFileSync, exists = fs.existsSync } = {}) {
  const file = pairingPath(profileDir);
  if (!exists(file)) return null;
  try {
    const data = JSON.parse(readFile(file, 'utf8'));
    if (!data?.code || !Number.isFinite(Number(data.expires))) return null;
    if (Number(data.expires) < now) return null;
    return { code: String(data.code), expires: Number(data.expires) };
  } catch {
    return null;
  }
}

export function clearPairing(profileDir, { unlink = fs.unlinkSync, exists = fs.existsSync } = {}) {
  const file = pairingPath(profileDir);
  if (!exists(file)) return;
  try { unlink(file); } catch { /* already gone */ }
}

export function tryPair(config, text, userId, pairing) {
  if (!pairing?.code) return { ok: false };
  if (String(text ?? '').trim() !== String(pairing.code)) return { ok: false };
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false };
  const ids = [...(config?.allowedUserIds || [])];
  if (!ids.includes(id)) ids.push(id);
  return { ok: true, config: { ...config, allowedUserIds: ids } };
}

export function persistConfig(profileDir, config) {
  saveConfig(profileDir, config);
  return config;
}
