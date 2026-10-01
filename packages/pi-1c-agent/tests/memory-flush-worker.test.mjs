import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireWorkerLock,
  ensureMemoryFlushWorker,
  hasPendingWork,
  migrateHomePending,
  peekWorkerLock,
  releaseWorkerLock,
  runMemoryFlushWorker,
} from '../lib/memory-flush-worker.mjs';
import { listPendingRecords, queueItemCounts, queuePendingRecord } from '../lib/memory-reconcile.mjs';

function tempProfile() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-flush-'));
}

function seedPending(profile, content = 'fact: background') {
  return queuePendingRecord(profile, {
    idempotency_key: 'task=flush; agent=pi; date=2026-10-01; content_hash=flushhash00000001',
    target: 'memory',
    content,
    task: 'flush',
    content_hash: 'flushhash00000001',
    status: 'queued',
  });
}

test('lock blocks a second worker and recovers a dead pid', () => {
  const profile = tempProfile();
  const first = acquireWorkerLock(profile, { pid: process.pid });
  assert.equal(first.ok, true);
  const second = acquireWorkerLock(profile, { pid: process.pid + 1 });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already-running');
  assert.equal(peekWorkerLock(profile).alive, true);
  assert.equal(releaseWorkerLock(profile, process.pid), true);
  const deadPath = path.join(profile, 'state', 'agent-memory', 'worker.lock');
  fs.mkdirSync(path.dirname(deadPath), { recursive: true });
  fs.writeFileSync(deadPath, JSON.stringify({ pid: 999999999, startedAt: 1 }));
  const recovered = acquireWorkerLock(profile, { pid: process.pid });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, true);
  releaseWorkerLock(profile, process.pid);
});

test('ensureMemoryFlushWorker spawn is detached and skips a live lock', () => {
  const profile = tempProfile();
  seedPending(profile);
  const spawned = [];
  let unrefed = false;
  const first = ensureMemoryFlushWorker(profile, {
    spawnImpl: (cmd, args, opts) => {
      spawned.push({ cmd, args, opts });
      return { pid: 4242, unref() { unrefed = true; } };
    },
  });
  assert.equal(first.started, true);
  assert.equal(first.reason, 'spawned');
  assert.equal(spawned[0].opts.detached, true);
  assert.equal(spawned[0].opts.stdio, 'ignore');
  assert.deepEqual(spawned[0].args.slice(-2), ['--run', path.resolve(profile)]);
  assert.equal(unrefed, true);

  acquireWorkerLock(profile, { pid: process.pid });
  const again = ensureMemoryFlushWorker(profile, {
    spawnImpl: () => { throw new Error('must not spawn'); },
  });
  assert.equal(again.started, false);
  assert.equal(again.reason, 'already-running');
  releaseWorkerLock(profile, process.pid);
});

test('empty queue does not spawn', () => {
  const profile = tempProfile();
  const result = ensureMemoryFlushWorker(profile, {
    homePending: path.join(profile, 'missing-legacy'),
    spawnImpl: () => { throw new Error('must not spawn'); },
  });
  assert.equal(result.started, false);
  assert.equal(result.reason, 'empty');
  assert.equal(hasPendingWork(profile, { homePending: path.join(profile, 'missing-legacy') }), false);
});

test('worker drains pending into done with stub adapters', async () => {
  const profile = tempProfile();
  seedPending(profile);
  const remembered = [];
  const result = await runMemoryFlushWorker({
    profileDir: profile,
    homePending: path.join(profile, 'no-legacy'),
    probe: async () => ({ memory: true, knowledge: true }),
    adapters: {
      existsByKey: async () => false,
      remember: async (record) => {
        remembered.push(record);
        return { ok: true };
      },
      recall: async () => true,
    },
    sleep: async () => {},
    maxOfflineRetries: 1,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.confirmed, 1);
  assert.equal(remembered.length, 1);
  assert.equal(listPendingRecords(profile).length, 0);
  assert.equal(queueItemCounts(profile).done, 1);
  assert.equal(peekWorkerLock(profile).alive, false);
});

test('offline worker leaves the queue intact', async () => {
  const profile = tempProfile();
  seedPending(profile);
  let sleeps = 0;
  const result = await runMemoryFlushWorker({
    profileDir: profile,
    homePending: path.join(profile, 'no-legacy'),
    probe: async () => ({ memory: false, knowledge: false }),
    adapters: {
      remember: async () => ({ ok: true }),
      recall: async () => true,
    },
    sleep: async () => { sleeps += 1; },
    maxOfflineRetries: 2,
    offlineDelayMs: 1,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.offline, true);
  assert.equal(listPendingRecords(profile).length, 1);
  assert.equal(sleeps, 1);
});

test('legacy home pending is migrated into the profile queue', () => {
  const profile = tempProfile();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-legacy-'));
  fs.writeFileSync(path.join(home, 'old.md'), [
    '---',
    'idempotency_key: task=legacy; agent=cursor; date=2026-10-01; content_hash=legacyhash0000001',
    'status: UNCONFIRMED',
    'target: memory',
    '---',
    '',
    'fact: old home queue',
    '',
  ].join('\n'));
  const migrated = migrateHomePending(profile, { homePending: home });
  assert.equal(migrated.migrated, 1);
  assert.equal(fs.readdirSync(home).length, 0);
  assert.equal(listPendingRecords(profile).length, 1);
  assert.match(listPendingRecords(profile)[0].content, /old home queue/);
});
