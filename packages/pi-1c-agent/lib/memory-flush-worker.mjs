import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultSleep } from './memory-write.mjs';
import { createMcpAdapters, probeMemoryServers } from './memory-mcp.mjs';
import {
  ensureMemoryStateDirs,
  formatReconcileReport,
  parsePendingRecord,
  queueItemCounts,
  queuePendingRecord,
  reconcilePending,
  resolveMemoryStateRoots,
} from './memory-reconcile.mjs';

export const DEFAULT_OFFLINE_RETRIES = 3;
export const DEFAULT_OFFLINE_DELAY_MS = 5000;

export function workerLockPath(profileDir) {
  return path.join(resolveMemoryStateRoots(profileDir).pending, '..', 'worker.lock');
}

export function workerLogPath(profileDir) {
  return path.join(resolveMemoryStateRoots(profileDir).pending, '..', 'worker.log');
}

export function legacyHomePendingDir(env = process.env, homedir = os.homedir()) {
  const override = String(env.PI_1C_LEGACY_MEMORY_PENDING ?? '').trim();
  if (override) return override;
  return path.join(homedir, '.local', 'state', 'agent-memory', 'pending');
}

export function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function peekWorkerLock(profileDir) {
  const lockPath = path.resolve(workerLockPath(profileDir));
  if (!fs.existsSync(lockPath)) return { alive: false, lockPath };
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return { alive: isPidAlive(existing.pid), pid: existing.pid, lockPath };
  } catch {
    return { alive: false, lockPath };
  }
}

export function acquireWorkerLock(profileDir, { pid = process.pid, now = Date.now() } = {}) {
  ensureMemoryStateDirs(profileDir);
  const lockPath = path.resolve(workerLockPath(profileDir));
  const payload = `${JSON.stringify({ pid, startedAt: now })}\n`;
  try {
    fs.writeFileSync(lockPath, payload, { flag: 'wx' });
    return { ok: true, pid, lockPath };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = peekWorkerLock(profileDir);
    if (existing.alive) return { ok: false, reason: 'already-running', pid: existing.pid, lockPath };
    try { fs.unlinkSync(lockPath); } catch { /* raced */ }
    try {
      fs.writeFileSync(lockPath, payload, { flag: 'wx' });
      return { ok: true, pid, lockPath, recovered: true };
    } catch (err2) {
      if (err2?.code === 'EEXIST') return { ok: false, reason: 'already-running', lockPath };
      throw err2;
    }
  }
}

export function releaseWorkerLock(profileDir, pid = process.pid) {
  const lockPath = path.resolve(workerLockPath(profileDir));
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (Number(existing.pid) !== Number(pid)) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

export function appendWorkerLog(profileDir, message) {
  const filePath = path.resolve(workerLogPath(profileDir));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${new Date().toISOString()} ${message}\n`);
}

export function migrateHomePending(profileDir, { homePending } = {}) {
  const destDirs = ensureMemoryStateDirs(profileDir);
  const srcDir = homePending || legacyHomePendingDir();
  if (!srcDir || !fs.existsSync(srcDir)) return { migrated: 0 };
  if (path.resolve(srcDir) === path.resolve(destDirs.pending)) return { migrated: 0 };
  let migrated = 0;
  for (const name of fs.readdirSync(srcDir)) {
    if (name.startsWith('.')) continue;
    const src = path.join(srcDir, name);
    try {
      const rec = parsePendingRecord(fs.readFileSync(src, 'utf8'), src);
      queuePendingRecord(profileDir, { ...rec, status: rec.status || 'queued' });
      fs.unlinkSync(src);
      migrated += 1;
    } catch {
      // leave unreadable source file
    }
  }
  return { migrated };
}

function legacyHasWork(homePending) {
  if (!homePending || !fs.existsSync(homePending)) return false;
  return fs.readdirSync(homePending).some((name) => !name.startsWith('.'));
}

export function hasPendingWork(profileDir, { homePending } = {}) {
  const counts = queueItemCounts(profileDir);
  if (counts.pending > 0 || counts.processing > 0) return true;
  const src = homePending || legacyHomePendingDir();
  const dest = resolveMemoryStateRoots(profileDir).pending;
  if (src && path.resolve(src) === path.resolve(dest)) return false;
  return legacyHasWork(src);
}

export function resolveWorkerProfileDir(profileDir, env = process.env) {
  return path.resolve(String(profileDir ?? '').trim() || env.PI_CODING_AGENT_DIR || process.cwd());
}

export function ensureMemoryFlushWorker(profileDir, opts = {}) {
  const root = resolveWorkerProfileDir(profileDir, opts.env || process.env);
  if (!hasPendingWork(root, { homePending: opts.homePending })) {
    return { started: false, reason: 'empty' };
  }
  const lock = peekWorkerLock(root);
  if (lock.alive) return { started: false, reason: 'already-running', pid: lock.pid };
  const spawnImpl = opts.spawnImpl || spawn;
  const workerScript = opts.workerScript || fileURLToPath(import.meta.url);
  const execPath = opts.execPath || process.execPath;
  const child = spawnImpl(execPath, [workerScript, '--run', root], {
    detached: opts.detached !== false,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...(opts.env || {}),
      PI_CODING_AGENT_DIR: root,
      PI_1C_MEMORY_FLUSH_WORKER: '1',
    },
    windowsHide: true,
  });
  if (typeof child?.unref === 'function') child.unref();
  return { started: true, pid: child?.pid, reason: 'spawned' };
}

export async function runMemoryFlushWorker(opts = {}) {
  const profileDir = resolveWorkerProfileDir(opts.profileDir, opts.env || process.env);
  const acquired = acquireWorkerLock(profileDir, { pid: opts.pid || process.pid });
  if (!acquired.ok) return { status: 'skipped', reason: acquired.reason, pid: acquired.pid };
  const sleep = typeof opts.sleep === 'function' ? opts.sleep : defaultSleep;
  const maxRetries = Number.isFinite(Number(opts.maxOfflineRetries)) ? Number(opts.maxOfflineRetries) : DEFAULT_OFFLINE_RETRIES;
  const delayMs = Number.isFinite(Number(opts.offlineDelayMs)) ? Number(opts.offlineDelayMs) : DEFAULT_OFFLINE_DELAY_MS;
  try {
    const migrated = migrateHomePending(profileDir, opts);
    if (migrated.migrated) appendWorkerLog(profileDir, `migrated ${migrated.migrated} legacy pending`);
    if (!hasPendingWork(profileDir, { homePending: opts.homePending })) {
      appendWorkerLog(profileDir, 'idle');
      return { status: 'idle', migrated: migrated.migrated };
    }
    appendWorkerLog(profileDir, 'start');
    let lastSummary = null;
    for (let i = 0; i < Math.max(1, maxRetries); i += 1) {
      let reachable = { memory: false, knowledge: false };
      try {
        reachable = typeof opts.probe === 'function' ? await opts.probe() : await probeMemoryServers();
      } catch {
        reachable = { memory: false, knowledge: false };
      }
      const adapters = opts.adapters || createMcpAdapters();
      lastSummary = await reconcilePending({
        profileDir,
        serversReachable: reachable,
        ...adapters,
      });
      const leftover = queueItemCounts(profileDir);
      if (leftover.pending === 0 && leftover.processing === 0) break;
      if (lastSummary.offline && i < maxRetries - 1) {
        await sleep(delayMs);
        continue;
      }
      break;
    }
    const report = lastSummary ? formatReconcileReport(lastSummary) : 'memory-flush: idle';
    appendWorkerLog(profileDir, report);
    return { status: 'ok', summary: lastSummary };
  } finally {
    releaseWorkerLock(profileDir, acquired.pid);
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  if (args[0] === '--run') {
    runMemoryFlushWorker({ profileDir: args[1] }).catch((error) => {
      try { appendWorkerLog(args[1] || process.env.PI_CODING_AGENT_DIR, `error ${error?.message || error}`); } catch { /* ignore */ }
      process.exitCode = 1;
    });
  } else {
    ensureMemoryFlushWorker(args[0] || process.env.PI_CODING_AGENT_DIR);
  }
}
