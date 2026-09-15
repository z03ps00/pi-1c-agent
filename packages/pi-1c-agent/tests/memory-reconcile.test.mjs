import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatReconcileReport,
  listPendingRecords,
  queuePendingRecord,
  reconcilePending,
  serializePendingRecord,
} from '../lib/memory-reconcile.mjs';

const profilePending = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'state',
  'agent-memory',
  'pending',
  '20260915-approve-mode.md',
);

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
  assert.ok(fs.existsSync(profilePending), 'fixture pending record missing');
  const profile = tempProfile();
  const dest = path.join(profile, 'state', 'agent-memory', 'pending');
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(profilePending, path.join(dest, '20260915-approve-mode.md'));
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
  assert.ok(fs.existsSync(path.join(profile, 'state', 'agent-memory', 'done', '20260915-approve-mode.md')));
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
