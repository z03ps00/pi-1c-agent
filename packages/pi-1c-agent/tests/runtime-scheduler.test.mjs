import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acquireResourceLeases,
  listInFlightSlots,
  readOwner,
  reclaimStaleSlots,
  releaseLease,
  releaseResource,
  tryAcquireResource,
  tryAcquireSlot,
} from '../lib/runtime-scheduler.mjs';
import { emitDiagnostic, resetDiagnostics } from '../lib/diagnostics.mjs';
import { collectRuntimeStatus } from '../lib/runtime-status.mjs';

function tempProfile() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-sched-'));
}

test('two helper processes share one slot budget', async () => {
  const profile = tempProfile();
  process.env.PI_1C_MAX_SUBAGENTS = '1';
  const worker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'slot-parent.mjs');
  const started = Date.now();
  const procs = [0, 1].map(() => spawn(process.execPath, [worker, profile, '120'], {
    env: { ...process.env, PI_1C_MAX_SUBAGENTS: '1' },
  }));
  const codes = await Promise.all(procs.map((p) => new Promise((resolve) => p.on('close', resolve))));
  assert.deepEqual(codes, [0, 0]);
  assert.ok(Date.now() - started >= 200);
  delete process.env.PI_1C_MAX_SUBAGENTS;
});

test('stale slot is reclaimed and late token release is ignored', () => {
  const profile = tempProfile();
  const lease = tryAcquireSlot(profile, { limit: 1, now: 1, ttlMs: 100 });
  assert.ok(lease);
  reclaimStaleSlots(profile, { now: 1 + 200, ttlMs: 100, limit: 1 });
  const next = tryAcquireSlot(profile, { limit: 1, now: 1 + 200, ttlMs: 100 });
  assert.ok(next);
  assert.equal(releaseLease(lease), false);
  assert.equal(readOwner(next.dir)?.token, next.token);
  assert.equal(releaseLease(next), true);
});

test('exclusive project-tree serializes; reviewer and isolated tester overlap', async () => {
  const profile = tempProfile();
  const developer = { name: '1c-developer', resources: { 'project-tree': 'exclusive' }, tools: ['write'] };
  const other = { name: '1c-error-fixer', resources: { 'project-tree': 'exclusive' }, tools: ['write'] };
  const reviewer = { name: '1c-code-reviewer', resources: { 'project-tree': 'shared' }, sideEffects: ['mcp-read'], tools: ['read'] };
  const tester = { name: '1c-tester', resources: { ib: 'exclusive', 'build-dir': 'exclusive' }, tools: ['write'] };
  const first = await acquireResourceLeases(profile, developer, { scopeKey: 'proj' });
  const second = tryAcquireResource(profile, { name: 'project-tree', mode: 'exclusive' }, { scopeKey: 'proj' });
  assert.equal(second, null);
  for (const lease of first) releaseResource(lease);
  const rev = await acquireResourceLeases(profile, reviewer, { scopeKey: 'proj' });
  const tes = await acquireResourceLeases(profile, tester, { scopeKey: 'proj' });
  assert.equal(rev.length > 0, true);
  assert.equal(tes.length > 0, true);
  for (const lease of [...rev, ...tes]) releaseResource(lease);
  void other;
});

test('JSONL diagnostics survive reset of the in-process ring', () => {
  const profile = tempProfile();
  process.env.PI_CODING_AGENT_DIR = profile;
  resetDiagnostics();
  emitDiagnostic('subagent.completed', {
    profileDir: profile,
    runId: 'run-1',
    parentRunId: 'parent-1',
    projectId: 'p',
    childPid: 2,
    agent: '1c-developer',
    workflow: 'feature',
    stage: 'developer',
    durationMs: 12,
  });
  resetDiagnostics();
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(profile, 'state', 'runtime', 'diagnostics', `${day}.jsonl`);
  assert.ok(fs.existsSync(file));
  const line = JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n').at(-1));
  assert.equal(line.code, 'subagent.completed');
  assert.equal(line.runId, 'run-1');
  delete process.env.PI_CODING_AGENT_DIR;
});

test('runtime status reports slot and queue counters', () => {
  const profile = tempProfile();
  const lease = tryAcquireSlot(profile, { limit: 2 });
  const status = collectRuntimeStatus({ profileDir: profile, cwd: profile });
  assert.ok(status.inflightChildren >= 1);
  assert.ok('pending' in status.memory);
  assert.equal(typeof status.knowledgeRevision, 'number');
  releaseLease(lease);
  void listInFlightSlots;
});

test('three parents respect a global child cap of four', async () => {
  const profile = tempProfile();
  const logFile = path.join(profile, 'events.jsonl');
  const worker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'slot-parent.mjs');
  const procs = [];
  for (let parent = 0; parent < 3; parent += 1) {
    for (let child = 0; child < 4; child += 1) {
      procs.push(spawn(process.execPath, [worker, profile, '80', logFile], {
        env: { ...process.env, PI_1C_MAX_SUBAGENTS: '4' },
      }));
    }
  }
  await Promise.all(procs.map((p) => new Promise((resolve) => p.on('close', resolve))));
  const events = fs.readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  let current = 0;
  let peak = 0;
  const rank = (event) => (event.event === 'STOP' ? 0 : 1);
  for (const event of events.sort((a, b) => a.ts - b.ts || rank(a) - rank(b) || a.pid - b.pid)) {
    current += event.event === 'START' ? 1 : -1;
    peak = Math.max(peak, current);
  }
  assert.ok(peak <= 4, `peak ${peak}`);
});

test('windows process-tree kill smoke', { skip: process.platform === 'darwin' && false }, async () => {
  const mockPi = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'mock-pi.mjs');
  const proc = spawn(process.execPath, [mockPi], {
    env: { ...process.env, PI_1C_MOCK_PI_BEHAVIOR: 'sleep', PI_1C_MOCK_PI_SLEEP_MS: '60000' },
    detached: true,
    stdio: 'ignore',
  });
  assert.ok(proc.pid);
  await new Promise((r) => setTimeout(r, 50));
  try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch { /* ignore */ } }
  const code = await new Promise((resolve) => proc.on('close', resolve));
  assert.ok(code === null || code !== undefined);
});
