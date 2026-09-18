import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { declaredResources } from './agent-policy.mjs';

function defaultLimit(env = process.env) {
  const n = Number(env.PI_1C_MAX_SUBAGENTS ?? 4);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 4;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function runtimeProfileDir(env = process.env, fallback = '') {
  const explicit = String(fallback || '').trim();
  if (explicit) return explicit;
  return String(env.PI_CODING_AGENT_DIR || '').trim();
}

export function slotTtlMs(env = process.env) {
  const n = Number(env.PI_1C_SUBAGENT_TIMEOUT_MS ?? 600_000);
  return Number.isFinite(n) && n >= 1_000 ? Math.trunc(n) : 600_000;
}

export function runtimeRoot(profileDir) {
  return path.join(profileDir, 'state', 'runtime');
}

export function slotsRoot(profileDir) {
  return path.join(runtimeRoot(profileDir), 'subagents', 'slots');
}

export function resourcesRoot(profileDir) {
  return path.join(runtimeRoot(profileDir), 'resources');
}

function ownerPath(dir) {
  return path.join(dir, 'owner.json');
}

function writeOwner(dir, owner) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `owner.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(owner)}\n`);
  fs.renameSync(tmp, ownerPath(dir));
}

export function readOwner(dir) {
  try {
    return JSON.parse(fs.readFileSync(ownerPath(dir), 'utf8'));
  } catch {
    return null;
  }
}

function makeOwner() {
  const now = Date.now();
  return {
    token: crypto.randomUUID(),
    pid: process.pid,
    host: os.hostname(),
    acquiredAt: now,
    heartbeatAt: now,
  };
}

function isStale(owner, now, ttlMs) {
  const beat = Number(owner?.heartbeatAt || owner?.acquiredAt || 0);
  return !beat || now - beat > ttlMs;
}

function tryRmDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

const PENDING_CLAIM_GRACE_MS = 5_000;

function dirMtimeMs(dir) {
  try {
    return fs.statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}

function isPendingClaim(dir, now, ttlMs) {
  const mtime = dirMtimeMs(dir);
  if (!mtime) return false;
  const age = now - mtime;
  const grace = Math.min(Math.max(ttlMs, 1), PENDING_CLAIM_GRACE_MS);
  return age < grace || now < mtime;
}

export function reclaimStaleSlots(profileDir, { now = Date.now(), ttlMs = slotTtlMs(), limit = defaultLimit() } = {}) {
  const root = slotsRoot(profileDir);
  if (!fs.existsSync(root)) return 0;
  let n = 0;
  for (let slot = 0; slot < limit; slot += 1) {
    const dir = path.join(root, String(slot));
    if (!fs.existsSync(dir)) continue;
    const owner = readOwner(dir);
    if (!owner) {
      // mkdir is the claim; do not steal a dir that has not written owner.json yet
      if (isPendingClaim(dir, now, ttlMs)) continue;
      tryRmDir(dir);
      n += 1;
      continue;
    }
    if (isStale(owner, now, ttlMs)) {
      tryRmDir(dir);
      n += 1;
    }
  }
  return n;
}

export function tryAcquireSlot(profileDir, { now = Date.now(), ttlMs = slotTtlMs(), limit = defaultLimit() } = {}) {
  fs.mkdirSync(slotsRoot(profileDir), { recursive: true });
  reclaimStaleSlots(profileDir, { now, ttlMs, limit });
  for (let slot = 0; slot < limit; slot += 1) {
    const dir = path.join(slotsRoot(profileDir), String(slot));
    try {
      fs.mkdirSync(dir);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      continue;
    }
    const owner = makeOwner();
    owner.acquiredAt = now;
    owner.heartbeatAt = now;
    writeOwner(dir, owner);
    return { kind: 'slot', slot, dir, token: owner.token, profileDir };
  }
  return null;
}

export function heartbeatLease(lease, { now = Date.now() } = {}) {
  if (!lease?.dir || !lease?.token) return false;
  const owner = readOwner(lease.dir);
  if (!owner || owner.token !== lease.token) return false;
  writeOwner(lease.dir, { ...owner, heartbeatAt: now });
  return true;
}

export function releaseLease(lease) {
  if (!lease?.dir) return false;
  const owner = readOwner(lease.dir);
  if (!owner) {
    tryRmDir(lease.dir);
    return false;
  }
  if (lease.token && owner.token !== lease.token) return false;
  tryRmDir(lease.dir);
  return true;
}

export async function acquireProfileSlot(profileDir, {
  timeoutMs = slotTtlMs(),
  pollMs = 25,
  now = Date.now,
  ttlMs = slotTtlMs(),
  limit = defaultLimit(),
} = {}) {
  const started = typeof now === 'function' ? now() : now;
  const clock = typeof now === 'function' ? now : () => Date.now();
  while (true) {
    const lease = tryAcquireSlot(profileDir, { now: clock(), ttlMs, limit });
    if (lease) return lease;
    if (clock() - started > timeoutMs) throw new Error('profile subagent slot timeout');
    await sleep(pollMs);
  }
}

function resourceDir(profileDir, resource, scopeKey) {
  const hash = crypto.createHash('sha256').update(`${resource.name}:${scopeKey}`).digest('hex').slice(0, 16);
  return path.join(resourcesRoot(profileDir), `${resource.name}-${hash}.lock`);
}

function readHolders(dir) {
  const file = path.join(dir, 'holders.json');
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value.holders) ? value : { holders: [] };
  } catch {
    return { holders: [] };
  }
}

function writeHolders(dir, value) {
  const tmp = path.join(dir, `holders.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(value)}\n`);
  fs.renameSync(tmp, path.join(dir, 'holders.json'));
}

export function tryAcquireResource(profileDir, resource, {
  scopeKey = 'default',
  now = Date.now(),
  ttlMs = slotTtlMs(),
} = {}) {
  const dir = resourceDir(profileDir, resource, scopeKey);
  fs.mkdirSync(dir, { recursive: true });
  const state = readHolders(dir);
  state.holders = state.holders.filter((h) => !isStale(h, now, ttlMs));
  const exclusiveHeld = state.holders.some((h) => h.mode === 'exclusive');
  const sharedHeld = state.holders.some((h) => h.mode === 'shared');
  if (resource.mode === 'exclusive' && state.holders.length) return null;
  if (resource.mode === 'shared' && exclusiveHeld) return null;
  if (resource.mode === 'exclusive' && sharedHeld) return null;
  const owner = { ...makeOwner(), mode: resource.mode, name: resource.name, scopeKey };
  owner.acquiredAt = now;
  owner.heartbeatAt = now;
  state.holders.push(owner);
  writeHolders(dir, state);
  return {
    kind: 'resource',
    name: resource.name,
    mode: resource.mode,
    dir,
    token: owner.token,
    scopeKey,
    profileDir,
  };
}

export function heartbeatResource(lease, { now = Date.now() } = {}) {
  if (!lease?.dir || !lease?.token) return false;
  const state = readHolders(lease.dir);
  const holder = state.holders.find((h) => h.token === lease.token);
  if (!holder) return false;
  holder.heartbeatAt = now;
  writeHolders(lease.dir, state);
  return true;
}

export function releaseResource(lease) {
  if (!lease?.dir || !lease?.token) return false;
  const state = readHolders(lease.dir);
  const before = state.holders.length;
  state.holders = state.holders.filter((h) => h.token !== lease.token);
  if (state.holders.length === before) return false;
  if (state.holders.length === 0) {
    tryRmDir(lease.dir);
    return true;
  }
  writeHolders(lease.dir, state);
  return true;
}

export async function acquireResourceLeases(profileDir, agent, {
  scopeKey = 'default',
  timeoutMs = slotTtlMs(),
  pollMs = 25,
} = {}) {
  const wanted = declaredResources(agent);
  const started = Date.now();
  const held = [];
  for (const resource of wanted) {
    while (true) {
      const lease = tryAcquireResource(profileDir, resource, { scopeKey });
      if (lease) {
        held.push(lease);
        break;
      }
      if (Date.now() - started > timeoutMs) {
        for (const prev of held) releaseResource(prev);
        throw new Error(`resource lease timeout: ${resource.name}:${resource.mode}`);
      }
      await sleep(pollMs);
    }
  }
  return held;
}

export function startLeaseHeartbeat(leases, { intervalMs = 5_000 } = {}) {
  const list = Array.isArray(leases) ? leases : [leases];
  const timer = setInterval(() => {
    for (const lease of list) {
      if (!lease) continue;
      if (lease.kind === 'resource') heartbeatResource(lease);
      else heartbeatLease(lease);
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

export function listInFlightSlots(profileDir, { now = Date.now(), ttlMs = slotTtlMs(), limit = defaultLimit() } = {}) {
  const root = slotsRoot(profileDir);
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (let slot = 0; slot < limit; slot += 1) {
    const dir = path.join(root, String(slot));
    const owner = readOwner(dir);
    if (owner && !isStale(owner, now, ttlMs)) out.push({ slot, ...owner });
  }
  return out;
}
