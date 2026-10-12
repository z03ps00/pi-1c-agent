import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadToken, telegramDir } from './config.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function pidPath(profileDir) {
  return path.join(telegramDir(profileDir), 'gateway.pid');
}

export function launchScript(profileDir, exists = fs.existsSync) {
  const beside = path.join(pluginRoot, 'launch.mjs');
  if (exists(beside)) return beside;
  return path.join(profileDir, 'packages', 'pi-1c-telegram', 'launch.mjs');
}

export function gatewayRunning(profileDir, { readFile = fs.readFileSync, exists = fs.existsSync, kill = process.kill } = {}) {
  const file = pidPath(profileDir);
  if (!exists(file)) return false;
  const pid = Number(String(readFile(file, 'utf8')).trim());
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function startGateway(profileDir, deps = {}) {
  const {
    spawnImpl = spawn,
    exists = fs.existsSync,
    mkdir = fs.mkdirSync,
    writeFile = fs.writeFileSync,
    openSync = fs.openSync,
  } = deps;
  if (!loadToken(profileDir)) return { ok: false, message: 'Сначала введите токен бота.' };
  if (gatewayRunning(profileDir, deps)) return { ok: true, already: true, message: 'Бот уже запущен.' };
  const script = launchScript(profileDir, exists);
  if (!exists(script)) return { ok: false, message: 'Не найден launch.mjs плагина.' };
  const dir = telegramDir(profileDir);
  mkdir(dir, { recursive: true });
  const log = openSync(path.join(dir, 'gateway.log'), 'a');
  const child = spawnImpl(process.execPath, [script], {
    cwd: profileDir,
    env: { ...process.env, PI_CODING_AGENT_DIR: profileDir },
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref?.();
  writeFile(pidPath(profileDir), `${child.pid}\n`, { mode: 0o600 });
  return { ok: true, pid: child.pid, message: `Бот запущен, pid ${child.pid}.` };
}

export function stopGateway(profileDir, {
  readFile = fs.readFileSync,
  exists = fs.existsSync,
  unlink = fs.unlinkSync,
  kill = process.kill,
} = {}) {
  const file = pidPath(profileDir);
  if (!exists(file)) return { ok: true, message: 'Бот не запущен.' };
  const pid = Number(String(readFile(file, 'utf8')).trim());
  if (Number.isInteger(pid) && pid > 0) {
    try { kill(pid, 'SIGTERM'); } catch { /* already stopped */ }
  }
  try { unlink(file); } catch { /* already gone */ }
  return { ok: true, message: 'Бот остановлен.' };
}
