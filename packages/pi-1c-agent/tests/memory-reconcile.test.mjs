import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatReconcileReport,
  listPendingRecords,
  pendingRecordFileName,
  queueItemCounts,
  queuePendingRecord,
  reconcilePending,
  reclaimStaleClaims,
  reconstructQueueUniqueness,
  duplicateQueueIds,
  runStartupReconcile,
  serializePendingRecord,
  shouldSkipStartupReconcile,
  tryClaim,
  resolveMemoryStateRoots,
  ensureMemoryStateDirs,
  originalPendingName,
} from '../lib/memory-reconcile.mjs';

function tempProfile() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-mem-'));
}

test('reconcile drains when reachable and moves to done', async () => {
  const profile = tempProfile();
  queuePendingRecord(profile, {
    idempotency_key: 'task=a; agent=pi; date=2026-09-16; content_hash=abc',
    target: 'memory',
    content: 'fact: port 8001',
    status: 'UNCONFIRMED',
  });
  const remembered = [];
  const summary = await reconcilePending({
    profileDir: profile,
    serversReachable: { memory: true, knowledge: false },
    existsByKey: async () => false,
    remember: async (r) => {
      remembered.push(r);
      return { ok: true };
    },
    recall: async () => true,
  });
  assert.equal(summary.confirmed, 1);
  assert.equal(summary.pending, 0);
  assert.equal(remembered.length, 1);
  assert.equal(listPendingRecords(profile).length, 0);
  const done = fs.readdirSync(path.join(profile, 'state', 'agent-memory', 'done'));
  assert.equal(done.length, 1);
  assert.match(fs.readFileSync(path.join(profile, 'state', 'agent-memory', 'done', done[0]), 'utf8'), /status: confirmed/);
});

test('duplicate pending is skipped and confirmed without a second store', async () => {
  const profile = tempProfile();
  queuePendingRecord(profile, {
    idempotency_key: 'task=dup; agent=pi; date=2026-09-16; content_hash=def',
    target: 'memory',
    content: 'fact: already there',
  });
  let remembers = 0;
  const summary = await reconcilePending({
    profileDir: profile,
    serversReachable: { memory: true },
    existsByKey: async () => true,
    remember: async () => {
      remembers += 1;
      return { ok: true };
    },
    recall: async () => true,
  });
  assert.equal(summary.duplicateSkipped, 1);
  assert.equal(remembers, 0);
  assert.equal(listPendingRecords(profile).length, 0);
});

test('offline leaves the queue intact and reports once', async () => {
  const profile = tempProfile();
  queuePendingRecord(profile, {
    idempotency_key: 'task=off; agent=pi; date=2026-09-16; content_hash=ghi',
    target: 'memory',
    content: 'fact: wait',
  });
  const summary = await reconcilePending({
    profileDir: profile,
    serversReachable: { memory: false, knowledge: false },
    remember: async () => ({ ok: true }),
    recall: async () => true,
  });
  assert.equal(summary.offline, true);
  assert.equal(summary.pending, 1);
  assert.match(summary.reportedOnce, /unreachable/);
  assert.equal(listPendingRecords(profile).length, 1);
  assert.match(formatReconcileReport(summary), /still-pending 1/);
});

test('anonymous reconcile makes no writes', async () => {
  const profile = tempProfile();
  queuePendingRecord(profile, {
    idempotency_key: 'task=anon; agent=pi; date=2026-09-16; content_hash=jkl',
    target: 'memory',
    content: 'fact: no',
  });
  let remembers = 0;
  const summary = await reconcilePending({
    profileDir: profile,
    anonymous: true,
    serversReachable: { memory: true },
    remember: async () => {
      remembers += 1;
      return { ok: true };
    },
  });
  assert.equal(summary.skippedAnonymous, true);
  assert.equal(remembers, 0);
  assert.equal(listPendingRecords(profile).length, 1);
  assert.equal(formatReconcileReport(summary), 'memory-flush: skipped — anonymous');
});

test('existing approve-mode pending record is drainable by the reconcile path', async () => {
  const profile = tempProfile();
  queuePendingRecord(profile, {
    idempotency_key: 'task=approve-mode; agent=pi; date=2026-09-15; content_hash=approvemodehash01',
    target: 'memory',
    content: 'fact: approve-mode pending',
    status: 'UNCONFIRMED',
    task: 'approve-mode',
    content_hash: 'approvemodehash01',
  });
  const [record] = listPendingRecords(profile);
  assert.match(record.idempotency_key, /approve-mode/);
  assert.equal(record.status, 'UNCONFIRMED');
  const summary = await reconcilePending({
    profileDir: profile,
    serversReachable: { memory: true, knowledge: true },
    existsByKey: async () => false,
    remember: async () => ({ ok: true }),
    recall: async () => true,
  });
  assert.equal(summary.confirmed, 1);
  assert.equal(listPendingRecords(profile).length, 0);
  const done = fs.readdirSync(path.join(profile, 'state', 'agent-memory', 'done'));
  assert.equal(done.length, 1);
  assert.match(done[0], /approve-mode/);
});

test('paired pending filenames stay unique by target and hash', () => {
  const profile = tempProfile();
  const longSession = 'session-0123456789abcdef0123456789abcdef01234567';
  const fact = {
    idempotency_key: `task=${longSession}; agent=pi-1c-agent; date=2026-09-16; content_hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    target: 'memory',
    content: 'TYPE: session_capture',
    task: longSession,
    content_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  };
  const report = {
    idempotency_key: `task=${longSession}; agent=pi-1c-agent; date=2026-09-16; content_hash=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
    target: 'knowledge',
    content: '## Session capture',
    task: longSession,
    content_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };
  const a = queuePendingRecord(profile, fact);
  const b = queuePendingRecord(profile, report);
  assert.notEqual(path.basename(a), path.basename(b));
  const names = fs.readdirSync(path.join(profile, 'state', 'agent-memory', 'pending'));
  assert.equal(names.length, 2);
  const again = queuePendingRecord(profile, fact);
  assert.equal(path.basename(again), path.basename(a));
  assert.equal(fs.readdirSync(path.join(profile, 'state', 'agent-memory', 'pending')).length, 2);
  assert.match(pendingRecordFileName(fact), /memory-aaaaaaaaaaaaaaaa/);
  assert.match(pendingRecordFileName(report), /knowledge-bbbbbbbbbbbbbbbb/);
});

test('pending serialization is redacted', () => {
  const text = serializePendingRecord({
    idempotency_key: 'k',
    target: 'memory',
    status: 'UNCONFIRMED',
    content: 'password=secret',
  });
  assert.doesNotMatch(text, /password=secret/);
});

test('sixteen workers claim one pending file once', async () => {
  const { spawn } = await import('node:child_process');
  const profile = tempProfile();
  const file = queuePendingRecord(profile, {
    idempotency_key: 'task=race; agent=pi; date=2026-09-18; content_hash=racehash',
    target: 'memory',
    content: 'fact: one',
  });
  const worker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'claim-worker.mjs');
  const procs = Array.from({ length: 16 }, () => spawn(process.execPath, [worker, file, profile], { encoding: 'utf8' }));
  const codes = await Promise.all(procs.map((p) => new Promise((resolve) => p.on('close', resolve))));
  assert.equal(codes.filter((c) => c === 0).length, 1);
  assert.equal(codes.filter((c) => c === 2).length, 15);
});

test('stale processing claim is reclaimed after TTL', () => {
  const profile = tempProfile();
  const dirs = ensureMemoryStateDirs(profile);
  const pending = queuePendingRecord(profile, {
    idempotency_key: 'task=stale; agent=pi; date=2026-09-18; content_hash=stalehash',
    target: 'memory',
    content: 'fact: stale',
  });
  const claimed = tryClaim(pending, dirs.processing, { pid: 1, now: 1 });
  assert.ok(claimed);
  assert.equal(listPendingRecords(profile).length, 0);
  const n = reclaimStaleClaims(profile, { now: 1 + 400_000, ttlMs: 300_000 });
  assert.equal(n, 1);
  assert.equal(listPendingRecords(profile).length, 1);
});

test('transient remote failure returns the record to pending', async () => {
  const profile = tempProfile();
  queuePendingRecord(profile, {
    idempotency_key: 'task=fail; agent=pi; date=2026-09-18; content_hash=failhash',
    target: 'memory',
    content: 'fact: retry',
  });
  const summary = await reconcilePending({
    profileDir: profile,
    serversReachable: { memory: true },
    existsByKey: async () => false,
    remember: async () => ({ ok: false }),
    recall: async () => false,
  });
  assert.equal(summary.pending, 1);
  assert.equal(listPendingRecords(profile).length, 1);
  const counts = queueItemCounts(profile);
  assert.equal(counts.pending + counts.processing + counts.done + counts.failed, 1);
});

test('child env skips startup reconcile and failures emit diagnostics', async () => {
  const { resetDiagnostics, diagnosticEvents } = await import('../lib/diagnostics.mjs');
  resetDiagnostics();
  assert.equal(shouldSkipStartupReconcile({ PI_1C_CHILD_PROCESS: '1' }), true);
  const skipped = await runStartupReconcile({ env: { PI_1C_DISABLE_STARTUP_RECONCILE: '1' } });
  assert.equal(skipped.skipped, true);
  const profile = tempProfile();
  queuePendingRecord(profile, {
    idempotency_key: 'task=boom; agent=pi; date=2026-09-18; content_hash=boomhash',
    target: 'memory',
    content: 'fact: boom',
  });
  await assert.rejects(() => runStartupReconcile({
    profileDir: profile,
    env: {},
    probe: async () => { throw new Error('probe down'); },
  }));
  assert.ok(diagnosticEvents().some((e) => e.code === 'memory.lifecycle.probe.failed'));
});

test('crash during ACK leaves exactly one copy and does not double-write', async () => {
  const profile = tempProfile();
  const dirs = ensureMemoryStateDirs(profile);
  const pending = queuePendingRecord(profile, {
    idempotency_key: 'task=ackcrash; agent=pi; date=2026-09-18; content_hash=ackcrashhash0001',
    target: 'memory',
    content: 'fact: ack',
    task: 'ackcrash',
    content_hash: 'ackcrashhash0001',
  });
  const claimed = tryClaim(pending, dirs.processing, { pid: 9, now: 1 });
  assert.ok(claimed);
  fs.mkdirSync(dirs.done, { recursive: true });
  fs.copyFileSync(claimed, path.join(dirs.done, originalPendingName(claimed)));
  const repaired = reconstructQueueUniqueness(profile);
  assert.ok(repaired >= 1);
  const counts = queueItemCounts(profile);
  assert.equal(counts.pending + counts.processing + counts.done + counts.failed, 1);
  assert.equal(duplicateQueueIds(profile).length, 0);
  let remembers = 0;
  const summary = await reconcilePending({
    profileDir: profile,
    serversReachable: { memory: true },
    existsByKey: async () => true,
    remember: async () => {
      remembers += 1;
      return { ok: true };
    },
    recall: async () => true,
  });
  assert.equal(remembers, 0);
  assert.equal(summary.pending, 0);
  assert.equal(queueItemCounts(profile).pending + queueItemCounts(profile).processing + queueItemCounts(profile).done + queueItemCounts(profile).failed, 1);
});

test('reclaim during ACK does not duplicate the record', async () => {
  const profile = tempProfile();
  const dirs = ensureMemoryStateDirs(profile);
  const pending = queuePendingRecord(profile, {
    idempotency_key: 'task=reclaimack; agent=pi; date=2026-09-18; content_hash=reclaimackhash001',
    target: 'memory',
    content: 'fact: reclaim',
    task: 'reclaimack',
    content_hash: 'reclaimackhash001',
  });
  const claimed = tryClaim(pending, dirs.processing, { pid: 2, now: 1 });
  fs.copyFileSync(claimed, path.join(dirs.done, originalPendingName(claimed)));
  reclaimStaleClaims(profile, { now: 1 + 400_000, ttlMs: 300_000 });
  reconstructQueueUniqueness(profile);
  assert.equal(duplicateQueueIds(profile).length, 0);
  const counts = queueItemCounts(profile);
  assert.equal(counts.pending + counts.processing + counts.done + counts.failed, 1);
});

