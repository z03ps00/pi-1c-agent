import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyCaptureModel,
  applyIdleToggle,
  captureDoesNotTouchMainChat,
  captureModelStatus,
  captureSession,
  defaultCaptureState,
  distillHeuristic,
  footerCaptureLabel,
  formatFact,
  formatReport,
  isSubstantial,
  parseCaptureModelArgs,
  parseWrapArgs,
  restoreCaptureState,
  runDistiller,
  sessionIdempotencyKey,
  shouldIdleCapture,
  CAPTURE_STATE_TYPE,
} from '../lib/session-capture.mjs';

const substantialEntries = [
  { role: 'user', content: 'Harden memory writes' },
  { tool: 'write', input: { path: 'lib/redact.mjs' } },
  { role: 'assistant', content: 'decision: use one redaction routine\nverification: unit tests pass' },
];

test('heuristic distiller extracts files, tools, decisions without a provider', async () => {
  const distilled = distillHeuristic(substantialEntries);
  assert.ok(distilled.files.includes('lib/redact.mjs'));
  assert.ok(distilled.tools.includes('write'));
  assert.ok(distilled.locked_decisions.some((x) => /redaction/i.test(x)));
  assert.equal(isSubstantial(distilled), true);
  // Read-only Q&A (only a read tool, no changes/decisions) is NOT substantial.
  const readOnly = distillHeuristic([
    { role: 'user', content: 'What does this file do?' },
    { tool: 'read', input: { path: 'lib/redact.mjs' } },
    { role: 'assistant', content: 'It redacts secrets.' },
  ]);
  assert.equal(readOnly.files.length, 0);
  assert.equal(isSubstantial(readOnly), false);
  const ran = await runDistiller({ mode: 'off', entries: substantialEntries, distillWithProvider: async () => { throw new Error('should not call'); } });
  assert.equal(ran.used, 'heuristic');
  assert.equal(ran.fallback, false);
});

test('wrap writes paired records with one correlation_id and no raw transcript', async () => {
  const remembered = [];
  const result = await captureSession({
    entries: substantialEntries,
    sessionId: 'abc',
    cwd: '/tmp/demo',
    distillerMode: 'off',
    remember: async (record) => {
      remembered.push(record);
      return { ok: true };
    },
    recall: async () => true,
    existsByKey: async () => false,
  });
  assert.equal(result.status, 'recorded');
  assert.ok(result.correlation_id);
  assert.equal(remembered.length, 2);
  assert.equal(remembered[0].correlation_id, remembered[1].correlation_id);
  assert.deepEqual(new Set(remembered.map((r) => r.target)), new Set(['memory', 'knowledge']));
  assert.doesNotMatch(remembered[0].content, /assistant: decision:/);
  assert.doesNotMatch(JSON.stringify(remembered), /raw tool output|verbatim transcript/);
  assert.match(formatFact(result.distilled, { correlation_id: result.correlation_id }), /CORRELATION_ID/);
  assert.match(formatReport(result.distilled), /Session capture/);
});

test('trivial session writes nothing', async () => {
  let remembers = 0;
  const result = await captureSession({
    entries: [{ role: 'user', content: 'hi' }],
    distillerMode: 'off',
    remember: async () => {
      remembers += 1;
      return { ok: true };
    },
    recall: async () => true,
  });
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'nothing durable to save');
  assert.equal(remembers, 0);
});

test('anon and read-only modes write nothing and leave no pending', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-cap-'));
  const anon = await captureSession({
    entries: substantialEntries,
    anonLevel: 1,
    profileDir: profile,
    distillerMode: 'off',
    remember: async () => ({ ok: true }),
  });
  assert.equal(anon.status, 'skipped');
  assert.equal(anon.memory, 'Memory: skipped — anonymous');
  assert.equal(anon.wrotePending, false);
  const ask = await captureSession({
    entries: substantialEntries,
    mode: 'ask',
    profileDir: profile,
    distillerMode: 'off',
    remember: async () => ({ ok: true }),
  });
  assert.equal(ask.status, 'skipped');
  assert.equal(fs.existsSync(path.join(profile, 'state', 'agent-memory', 'pending')), false);
});

test('idle capture is on by default in Pi, toggle persists, Cursor is inactive', () => {
  const state = defaultCaptureState();
  assert.equal(state.idleEnabled, true);
  assert.equal(shouldIdleCapture({ host: 'pi', idleEnabled: state.idleEnabled, substantial: true }), true);
  assert.equal(shouldIdleCapture({ host: 'cursor', idleEnabled: true, substantial: true }), false);
  const off = applyIdleToggle(state, 'off');
  assert.equal(off.state.idleEnabled, false);
  assert.equal(shouldIdleCapture({ host: 'pi', idleEnabled: off.state.idleEnabled, substantial: true }), false);
  const restored = restoreCaptureState([
    { type: 'custom', customType: CAPTURE_STATE_TYPE, data: { state: off.state } },
  ]);
  assert.equal(restored.idleEnabled, false);
  assert.equal(footerCaptureLabel(defaultCaptureState(), 'cursor'), 'capture:manual');
});

test('repeated idle uses one session-scoped key family', () => {
  const distilled = distillHeuristic(substantialEntries);
  const a = sessionIdempotencyKey({ sessionId: 's1', distilled, agent: 'pi', date: '2026-09-16' });
  const b = sessionIdempotencyKey({ sessionId: 's1', distilled, agent: 'pi', date: '2026-09-16' });
  assert.equal(a, b);
});

test('out-of-band contract never touches the main chat', async () => {
  const contract = captureDoesNotTouchMainChat();
  assert.equal(contract.injectsIntoMainChat, false);
  assert.equal(contract.growsMainContext, false);
  assert.equal(contract.awaitedByMainTurn, false);
  const src = fs.readFileSync(new URL('../extensions/1c-memory/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /pi\.sendUserMessage|sendUserMessage\(/);
  assert.match(src, /captureInFlight/);
});

test('capture failure isolates to a pending record', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-cap-'));
  const result = await captureSession({
    entries: substantialEntries,
    sessionId: 'fail',
    cwd: '/tmp/demo',
    profileDir: profile,
    distillerMode: 'off',
    remember: async () => ({ ok: false }),
    recall: async () => false,
    existsByKey: async () => false,
  });
  assert.equal(result.status, 'UNCONFIRMED');
  assert.equal(result.wrotePending, true);
  const pending = fs.readdirSync(path.join(profile, 'state', 'agent-memory', 'pending'));
  assert.ok(pending.length >= 1);
});

test('capture-model set/status for each mode and fallback to heuristic', async () => {
  let state = defaultCaptureState();
  assert.equal(state.distiller.mode, 'stack');
  for (const raw of ['off', 'stack', 'chat', 'ollama qwen3.5:9b', 'routerai qwen/qwen3.5-9b']) {
    const parsed = parseCaptureModelArgs(raw);
    const applied = applyCaptureModel(state, parsed);
    assert.equal(applied.ok, true);
    state = applied.state;
    assert.match(captureModelStatus(state), /capture-model:/);
  }
  const persisted = restoreCaptureState([
    { type: 'custom', customType: CAPTURE_STATE_TYPE, data: { state } },
  ]);
  assert.equal(persisted.distiller.mode, 'routerai');
  assert.equal(persisted.distiller.model, 'qwen/qwen3.5-9b');

  let providerCalls = 0;
  const fallback = await runDistiller({
    mode: 'ollama',
    entries: substantialEntries,
    distillWithProvider: async () => {
      providerCalls += 1;
      throw new Error('down');
    },
  });
  assert.equal(providerCalls, 1);
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.used, 'heuristic-fallback');
  assert.match(parseWrapArgs('auto off').value, /off/);
});

test('opt-in archive marks a knowledge document, not a cognee fact', async () => {
  const remembered = [];
  await captureSession({
    entries: substantialEntries,
    sessionId: 'arch',
    cwd: '/tmp/demo',
    archiveTranscript: true,
    rawTranscript: 'user: hello\nassistant: world',
    distillerMode: 'off',
    remember: async (record) => {
      remembered.push(record);
      return { ok: true };
    },
    recall: async () => true,
    existsByKey: async () => false,
  });
  const archived = remembered.filter((r) => r.kind === 'raw-transcript-document');
  assert.equal(archived.length, 1);
  assert.equal(archived[0].target, 'knowledge');
  assert.match(archived[0].content, /raw-transcript-document/);
});

test('heuristic mode never calls a provider; keys stay out of records', async () => {
  process.env.KNOWLEDGE_MCP_AUTHORIZATION = 'secret-token-value';
  const remembered = [];
  await captureSession({
    entries: substantialEntries,
    cwd: '/tmp/demo',
    distillerMode: 'off',
    distillWithProvider: async () => {
      throw new Error('provider must not run');
    },
    remember: async (record) => {
      remembered.push(record);
      return { ok: true };
    },
    recall: async () => true,
    existsByKey: async () => false,
  });
  assert.doesNotMatch(JSON.stringify(remembered), /secret-token-value/);
  delete process.env.KNOWLEDGE_MCP_AUTHORIZATION;
});
