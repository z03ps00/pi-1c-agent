import test from 'node:test';
import assert from 'node:assert/strict';
import { withSubagentSlot, resetSubagentBudgetForTests, subagentInFlight } from '../lib/subagent-budget.mjs';
import { queueItemCounts, queuePendingRecord, reconcilePending } from '../lib/memory-reconcile.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const stress = process.env.PI_1C_STRESS === '1';

test('nightly concurrency stress keeps budget and queue conservation', { skip: !stress }, async () => {
  resetSubagentBudgetForTests();
  process.env.PI_1C_MAX_SUBAGENTS = '4';
  let peak = 0;
  let current = 0;
  const jobs = Array.from({ length: 32 }, () => withSubagentSlot(async () => {
    current += 1;
    peak = Math.max(peak, current);
    await new Promise((r) => setTimeout(r, 5));
    current -= 1;
  }));
  await Promise.all(jobs);
  assert.ok(peak <= 4);
  assert.equal(subagentInFlight(), 0);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-stress-'));
  for (let i = 0; i < 40; i += 1) {
    queuePendingRecord(profile, {
      idempotency_key: `task=s${i}; agent=pi; date=2026-09-18; content_hash=${String(i).padStart(16, 'a')}`,
      target: 'memory',
      content: `fact ${i}`,
      content_hash: String(i).padStart(16, 'a'),
      task: `s${i}`,
    });
  }
  await reconcilePending({
    profileDir: profile,
    serversReachable: { memory: true },
    existsByKey: async () => false,
    remember: async () => ({ ok: true }),
    recall: async () => true,
  });
  const counts = queueItemCounts(profile);
  assert.equal(counts.pending + counts.processing + counts.done + counts.failed, 40);
  assert.equal(counts.pending, 0);
  assert.equal(counts.processing, 0);
});
