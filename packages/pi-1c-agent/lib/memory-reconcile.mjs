import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseIdempotencyKey } from './memory-key.mjs';
import { redact } from './redact.mjs';
import { writeWithVerify } from './memory-write.mjs';
import { emitDiagnostic } from './diagnostics.mjs';

export const DEFAULT_CLAIM_TTL_SEC = 300;
export const MAX_RECONCILE_ATTEMPTS = 5;

export function resolveMemoryStateRoots(profileDir) {
  const root = path.resolve(String(profileDir ?? '').trim() || process.env.PI_CODING_AGENT_DIR || process.cwd());
  const base = path.join(root, 'state', 'agent-memory');
  return {
    root,
    pending: path.join(base, 'pending'),
    processing: path.join(base, 'processing'),
    done: path.join(base, 'done'),
    failed: path.join(base, 'failed'),
  };
}

export function ensureMemoryStateDirs(profileDir) {
  const dirs = resolveMemoryStateRoots(profileDir);
  fs.mkdirSync(dirs.pending, { recursive: true });
  fs.mkdirSync(dirs.processing, { recursive: true });
  fs.mkdirSync(dirs.done, { recursive: true });
  fs.mkdirSync(dirs.failed, { recursive: true });
  return dirs;
}

export function claimTtlMs(env = process.env) {
  const n = Number(env.PI_1C_MEMORY_CLAIM_TTL_SEC ?? DEFAULT_CLAIM_TTL_SEC);
  const sec = Number.isFinite(n) && n > 0 ? n : DEFAULT_CLAIM_TTL_SEC;
  return sec * 1000;
}

export function shouldSkipStartupReconcile(env = process.env) {
  return env.PI_1C_CHILD_PROCESS === '1' || env.PI_1C_DISABLE_STARTUP_RECONCILE === '1';
}

/** Max wait for session-start flush so BUILD print/TUI is not blocked on MCP. */
export const STARTUP_RECONCILE_BUDGET_MS = 8000;

export async function withBudget(promise, ms = STARTUP_RECONCILE_BUDGET_MS, label = 'startup reconcile') {
  const budget = Number(ms);
  const limit = Number.isFinite(budget) && budget > 0 ? budget : STARTUP_RECONCILE_BUDGET_MS;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${limit}ms`)), limit);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function parsePendingRecord(text, filePath = '') {
  const raw = String(text ?? '');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta = {};
  let body = raw;
  if (fm) {
    body = fm[2];
    for (const line of fm[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  const redacted = redact(body);
  return {
    filePath,
    idempotency_key: meta.idempotency_key || '',
    target: meta.target || inferTarget(meta, body),
    status: meta.status || 'UNCONFIRMED',
    agent: meta.agent || '',
    date: meta.date || '',
    scope: meta.scope || '',
    correlation_id: meta.correlation_id || '',
    content_hash: meta.content_hash || '',
    uri: meta.uri || '',
    task: meta.task || '',
    attempts: Number(meta.attempts) || 0,
    content: redacted.text,
    kinds: redacted.kinds,
  };
}

function inferTarget(meta, body) {
  if (meta.target) return meta.target;
  const blob = `${meta.idempotency_key || ''} ${body}`.toLowerCase();
  if (blob.includes('openviking') || blob.includes('knowledge')) return 'knowledge';
  return 'memory';
}

export function serializePendingRecord(record) {
  const redacted = redact(record.content || '');
  const lines = [
    '---',
    `idempotency_key: ${record.idempotency_key || ''}`,
    `status: ${record.status || 'UNCONFIRMED'}`,
    `target: ${record.target || 'memory'}`,
    `agent: ${record.agent || ''}`,
    `date: ${record.date || ''}`,
    `scope: ${record.scope || ''}`,
    `correlation_id: ${record.correlation_id || ''}`,
    `content_hash: ${record.content_hash || ''}`,
    `uri: ${record.uri || ''}`,
    `task: ${record.task || ''}`,
    `attempts: ${Number(record.attempts) || 0}`,
    '---',
    '',
    redacted.text,
    '',
  ];
  return lines.join('\n');
}

function listDirRecords(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md') || name.endsWith('.json') || /\.(?:md|json)\.\d+\.\d+$/.test(name))
    .sort()
    .map((name) => {
      const filePath = path.join(dir, name);
      try {
        return parsePendingRecord(fs.readFileSync(filePath, 'utf8'), filePath);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function listPendingRecords(profileDir) {
  const { pending } = resolveMemoryStateRoots(profileDir);
  return listDirRecords(pending);
}

export function originalPendingName(filePath) {
  const base = path.basename(String(filePath || ''));
  const m = base.match(/^(.*\.(?:md|json))\.\d+\.\d+$/);
  return m ? m[1] : base;
}

function claimedAtFromName(filePath) {
  const m = path.basename(String(filePath || '')).match(/\.(\d+)\.(\d+)$/);
  if (!m) return 0;
  return Number(m[2]) || 0;
}

export function tryClaim(pendingFile, processingDir, { pid = process.pid, now = Date.now() } = {}) {
  if (!pendingFile || !processingDir) return null;
  fs.mkdirSync(processingDir, { recursive: true });
  const claimed = path.join(processingDir, `${path.basename(pendingFile)}.${pid}.${now}`);
  try {
    fs.renameSync(pendingFile, claimed);
    return claimed;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export function reclaimStaleClaims(profileDir, { now = Date.now(), ttlMs = claimTtlMs() } = {}) {
  const dirs = ensureMemoryStateDirs(profileDir);
  let reclaimed = 0;
  if (!fs.existsSync(dirs.processing)) return reclaimed;
  for (const name of fs.readdirSync(dirs.processing)) {
    const src = path.join(dirs.processing, name);
    const claimedAt = claimedAtFromName(src) || (() => {
      try { return fs.statSync(src).mtimeMs; } catch { return 0; }
    })();
    if (!claimedAt || now - claimedAt < ttlMs) continue;
    const dest = path.join(dirs.pending, originalPendingName(src));
    try {
      fs.renameSync(src, dest);
      reclaimed += 1;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return reclaimed;
}

export function migrateLegacyPending(profileDir) {
  const dirs = ensureMemoryStateDirs(profileDir);
  // Legacy records already live in pending/*.md; ensure sibling dirs exist and
  // rewrite any file that is missing attempts metadata so the claim protocol can own it.
  let migrated = 0;
  for (const record of listPendingRecords(profileDir)) {
    if (record.attempts === 0 && !/attempts:/.test(fs.readFileSync(record.filePath, 'utf8'))) {
      fs.writeFileSync(record.filePath, serializePendingRecord(record));
      migrated += 1;
    }
  }
  return { migrated, pending: dirs.pending };
}

function safeFilePart(value, max) {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9._=-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
}

/** Filename is unique per target + content_hash; same key+target overwrites. */
export function pendingRecordFileName(record) {
  const parsed = parseIdempotencyKey(record?.idempotency_key);
  const task = safeFilePart(record?.task || parsed.task, 40) || 'pending';
  const target = safeFilePart(record?.target || 'memory', 16) || 'memory';
  const hash = safeFilePart(record?.content_hash || parsed.content_hash, 16) || 'pending';
  return `${task}-${target}-${hash}.md`;
}

export function queuePendingRecord(profileDir, record) {
  const dirs = ensureMemoryStateDirs(profileDir);
  const filePath = path.join(dirs.pending, pendingRecordFileName(record));
  fs.writeFileSync(filePath, serializePendingRecord({ ...record, status: record.status || 'UNCONFIRMED' }));
  return filePath;
}

function transitionClaim(src, destDir, record, status) {
  if (!src || !fs.existsSync(src)) return null;
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, originalPendingName(src));
  const body = serializePendingRecord({ ...record, status, filePath: dest });
  const tmp = `${src}.rewrite-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, src);
  try {
    fs.renameSync(src, dest);
  } catch (error) {
    if (error?.code === 'EEXIST' || fs.existsSync(dest)) {
      try { fs.unlinkSync(src); } catch { /* dest already holds the record */ }
      return dest;
    }
    throw error;
  }
  return dest;
}

export function listQueueCopies(profileDir) {
  const dirs = resolveMemoryStateRoots(profileDir);
  const copies = [];
  for (const state of ['pending', 'processing', 'done', 'failed']) {
    const dir = dirs[state];
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      copies.push({ state, dir, name, id: originalPendingName(path.join(dir, name)) });
    }
  }
  return copies;
}

export function duplicateQueueIds(profileDir) {
  const counts = new Map();
  for (const copy of listQueueCopies(profileDir)) {
    counts.set(copy.id, (counts.get(copy.id) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, count: n }));
}

export function reconstructQueueUniqueness(profileDir) {
  const copies = listQueueCopies(profileDir);
  const byId = new Map();
  for (const copy of copies) {
    const list = byId.get(copy.id) || [];
    list.push(copy);
    byId.set(copy.id, list);
  }
  const rank = { done: 3, failed: 2, processing: 1, pending: 0 };
  let repaired = 0;
  for (const list of byId.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => rank[b.state] - rank[a.state]);
    for (const extra of list.slice(1)) {
      try {
        fs.unlinkSync(path.join(extra.dir, extra.name));
        repaired += 1;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  return repaired;
}

function moveRecord(src, destDir, record, status) {
  return transitionClaim(src, destDir, record, status);
}

export function markPendingConfirmed(profileDir, record) {
  const dirs = ensureMemoryStateDirs(profileDir);
  return moveRecord(record.filePath, dirs.done, record, 'confirmed');
}

export function returnClaimToPending(profileDir, record) {
  const dirs = ensureMemoryStateDirs(profileDir);
  return moveRecord(record.filePath, dirs.pending, record, record.status || 'UNCONFIRMED');
}

export function markPendingFailed(profileDir, record) {
  const dirs = ensureMemoryStateDirs(profileDir);
  return moveRecord(record.filePath, dirs.failed, record, 'failed');
}

export function queueItemCounts(profileDir) {
  const dirs = resolveMemoryStateRoots(profileDir);
  const count = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => !n.startsWith('.')).length : 0);
  return {
    pending: count(dirs.pending),
    processing: count(dirs.processing),
    done: count(dirs.done),
    failed: count(dirs.failed),
  };
}

export async function reconcilePending({
  profileDir,
  serversReachable = {},
  existsByKey,
  remember,
  recall,
  anonymous = false,
} = {}) {
  const summary = {
    confirmed: 0,
    pending: 0,
    duplicateSkipped: 0,
    failed: 0,
    skippedAnonymous: false,
    offline: false,
    reportedOnce: '',
  };
  if (anonymous) {
    summary.skippedAnonymous = true;
    summary.pending = listPendingRecords(profileDir).length;
    summary.reportedOnce = 'reconciliation skipped — anonymous';
    return summary;
  }
  migrateLegacyPending(profileDir);
  reconstructQueueUniqueness(profileDir);
  reclaimStaleClaims(profileDir);
  const records = listPendingRecords(profileDir);
  if (records.length === 0) return summary;

  const reachable = (target) => serversReachable[target] === true;
  if (!reachable('memory') && !reachable('knowledge')) {
    summary.offline = true;
    summary.pending = records.length;
    summary.reportedOnce = 'memory servers unreachable; pending queue left intact';
    return summary;
  }

  const dirs = ensureMemoryStateDirs(profileDir);
  for (const record of records) {
    if (!reachable(record.target || 'memory')) {
      summary.pending += 1;
      if (!summary.reportedOnce) summary.reportedOnce = `target ${record.target} unreachable; left pending`;
      continue;
    }
    const claimed = tryClaim(record.filePath, dirs.processing);
    if (!claimed) continue;
    const owned = { ...record, filePath: claimed, attempts: (Number(record.attempts) || 0) + 1 };
    try {
      const result = await writeWithVerify({
        record: owned,
        existsByKey,
        remember,
        recall,
        queuePending: () => {},
      });
      if (result.status === 'duplicate') {
        markPendingConfirmed(profileDir, owned);
        summary.duplicateSkipped += 1;
        continue;
      }
      if (result.recorded) {
        markPendingConfirmed(profileDir, owned);
        summary.confirmed += 1;
        continue;
      }
      if (owned.attempts >= MAX_RECONCILE_ATTEMPTS) {
        markPendingFailed(profileDir, owned);
        summary.failed += 1;
        emitDiagnostic('memory.reconcile.partial', { reason: 'max-attempts', file: originalPendingName(claimed) });
        continue;
      }
      returnClaimToPending(profileDir, owned);
      summary.pending += 1;
    } catch (error) {
      returnClaimToPending(profileDir, owned);
      summary.pending += 1;
      emitDiagnostic('memory.reconcile.partial', { reason: error?.message || String(error) });
    }
  }
  if (summary.pending || summary.failed) {
    emitDiagnostic('memory.reconcile.partial', { pending: summary.pending, failed: summary.failed });
  }
  return summary;
}

export async function runStartupReconcile(opts = {}) {
  const env = opts.env ?? process.env;
  if (shouldSkipStartupReconcile(env)) {
    emitDiagnostic('memory.lifecycle.probe.skipped', { reason: 'child-process' });
    return { skipped: true, summary: null };
  }
  try {
    if (typeof opts.probe === 'function') await opts.probe();
    const summary = await reconcilePending(opts);
    return { skipped: false, summary };
  } catch (error) {
    emitDiagnostic('memory.lifecycle.probe.failed', { reason: error?.message || String(error) });
    throw error;
  }
}

export function formatReconcileReport(summary) {
  if (summary.skippedAnonymous) return 'memory-flush: skipped — anonymous';
  if (summary.offline) return `memory-flush: ${summary.reportedOnce} (confirmed 0, still-pending ${summary.pending}, duplicate-skipped 0)`;
  return `memory-flush: confirmed ${summary.confirmed}, still-pending ${summary.pending}, duplicate-skipped ${summary.duplicateSkipped}`;
}
