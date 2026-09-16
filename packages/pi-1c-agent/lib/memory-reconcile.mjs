import fs from 'node:fs';
import path from 'node:path';
import { parseIdempotencyKey } from './memory-key.mjs';
import { redact } from './redact.mjs';
import { writeWithVerify } from './memory-write.mjs';

export function resolveMemoryStateRoots(profileDir) {
  const root = path.resolve(String(profileDir ?? '').trim() || process.env.PI_CODING_AGENT_DIR || process.cwd());
  return {
    root,
    pending: path.join(root, 'state', 'agent-memory', 'pending'),
    done: path.join(root, 'state', 'agent-memory', 'done'),
  };
}

export function ensureMemoryStateDirs(profileDir) {
  const dirs = resolveMemoryStateRoots(profileDir);
  fs.mkdirSync(dirs.pending, { recursive: true });
  fs.mkdirSync(dirs.done, { recursive: true });
  return dirs;
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
    '---',
    '',
    redacted.text,
    '',
  ];
  return lines.join('\n');
}

export function listPendingRecords(profileDir) {
  const { pending } = resolveMemoryStateRoots(profileDir);
  if (!fs.existsSync(pending)) return [];
  return fs.readdirSync(pending)
    .filter((name) => name.endsWith('.md') || name.endsWith('.json'))
    .sort()
    .map((name) => {
      const filePath = path.join(pending, name);
      return parsePendingRecord(fs.readFileSync(filePath, 'utf8'), filePath);
    });
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

export function markPendingConfirmed(profileDir, record) {
  const dirs = ensureMemoryStateDirs(profileDir);
  const src = record.filePath;
  if (!src || !fs.existsSync(src)) return null;
  const dest = path.join(dirs.done, path.basename(src));
  const confirmed = serializePendingRecord({ ...record, status: 'confirmed' });
  fs.writeFileSync(dest, confirmed);
  fs.unlinkSync(src);
  return dest;
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
  const records = listPendingRecords(profileDir);
  if (records.length === 0) return summary;

  const reachable = (target) => serversReachable[target] === true;
  if (!reachable('memory') && !reachable('knowledge')) {
    summary.offline = true;
    summary.pending = records.length;
    summary.reportedOnce = 'memory servers unreachable; pending queue left intact';
    return summary;
  }

  for (const record of records) {
    if (!reachable(record.target || 'memory')) {
      summary.pending += 1;
      if (!summary.reportedOnce) summary.reportedOnce = `target ${record.target} unreachable; left pending`;
      continue;
    }
    const result = await writeWithVerify({
      record,
      existsByKey,
      remember,
      recall,
      queuePending: () => {},
    });
    if (result.status === 'duplicate') {
      markPendingConfirmed(profileDir, record);
      summary.duplicateSkipped += 1;
      continue;
    }
    if (result.recorded) {
      markPendingConfirmed(profileDir, record);
      summary.confirmed += 1;
      continue;
    }
    summary.pending += 1;
  }
  return summary;
}

export function formatReconcileReport(summary) {
  if (summary.skippedAnonymous) return 'memory-flush: skipped — anonymous';
  if (summary.offline) return `memory-flush: ${summary.reportedOnce} (confirmed 0, still-pending ${summary.pending}, duplicate-skipped 0)`;
  return `memory-flush: confirmed ${summary.confirmed}, still-pending ${summary.pending}, duplicate-skipped ${summary.duplicateSkipped}`;
}
