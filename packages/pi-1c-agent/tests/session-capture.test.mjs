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
  detectCaptureHost,
  distillHeuristic,
  flattenSessionEntries,
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
  distillWithProvider,
  parseDistillPayload,
  formatWrapNotify,
  CAPTURE_STATE_TYPE,
} from '../lib/session-capture.mjs';
import { distillPromptEntries } from '../lib/distill-provider.mjs';
import { createMcpAdapters, MCP_MUTATE_TIMEOUT_MS } from '../lib/memory-mcp.mjs';
import { resolveStackProvider } from '../lib/distill-provider.mjs';

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
  assert.equal(remembered[0].correlation_id, result.correlation_id);
  assert.match(remembered[0].content, new RegExp(`CORRELATION_ID: ${result.correlation_id}`));
  assert.match(remembered[1].content, new RegExp(result.correlation_id));
  assert.deepEqual(new Set(remembered.map((r) => r.target)), new Set(['memory', 'knowledge']));
  assert.doesNotMatch(remembered[0].content, /assistant: decision:/);
  assert.doesNotMatch(JSON.stringify(remembered), /raw tool output|verbatim transcript/);
  assert.match(formatFact(result.distilled, { correlation_id: result.correlation_id }), /CORRELATION_ID/);
  assert.match(formatReport(result.distilled), /Session capture/);
  const knowledge = remembered.find((r) => r.target === 'knowledge');
  assert.match(knowledge.uri, /viking:\/\/resources\/session-captures\/demo\/abc\.md/);
  assert.match(remembered.find((r) => r.target === 'memory').content, /TYPE: session_capture/);
  assert.match(remembered.find((r) => r.target === 'memory').content, /SCOPE: project:demo/);
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
  const eventCtx = { getContextUsage: () => ({ percent: 10 }) };
  assert.equal(detectCaptureHost(eventCtx), 'pi');
  assert.equal(detectCaptureHost({}), 'cursor');
  assert.equal(detectCaptureHost({ newSession: () => {} }), 'pi');
  assert.equal(footerCaptureLabel(defaultCaptureState(), detectCaptureHost(eventCtx)), 'capture:on/stack');
});

test('flatten unwraps Pi message + toolCall write as substantial', () => {
  const nested = [
    { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'Write a test scenario' }] } },
    {
      type: 'message',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'decision: persist capture writes' },
          { type: 'toolCall', name: 'write', arguments: { path: 'tests/demo.bsl', content: 'Процедура Тест()' } },
        ],
      },
    },
    {
      type: 'message',
      message: { role: 'toolResult', toolName: 'write', input: { path: 'tests/demo.bsl' }, content: 'ok' },
    },
  ];
  const flat = flattenSessionEntries(nested);
  const distilled = distillHeuristic(flat);
  assert.ok(distilled.tools.includes('write'));
  assert.ok(distilled.files.includes('tests/demo.bsl'));
  assert.equal(isSubstantial(distilled), true);

  const alreadyFlat = flattenSessionEntries(substantialEntries);
  const fromFlat = distillHeuristic(alreadyFlat);
  assert.ok(fromFlat.files.includes('lib/redact.mjs'));
  assert.equal(isSubstantial(fromFlat), true);
});

test('adapter writes Cognee data and an OpenViking session-captures document', async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return {
      ok: true,
      headers: { get: (name) => String(name).toLowerCase() === 'mcp-session-id' ? 'sess-1' : null },
      text: async () => 'task=session-abc; agent=pi; date=2026-09-16; content_hash=deadbeef',
    };
  };
  const adapters = createMcpAdapters(fetchImpl);
  await adapters.remember({
    target: 'memory',
    content: 'TYPE: session_capture\nshort fact',
    correlation_id: 'corr-abc',
    idempotency_key: 'task=session-abc; agent=pi; date=2026-09-16; content_hash=deadbeef',
  });
  await adapters.remember({
    target: 'knowledge',
    content: '## Session capture\nlong report',
    uri: 'viking://resources/session-captures/demo/abc.md',
    idempotency_key: 'task=session-abc; agent=pi; date=2026-09-16; content_hash=deadbeef',
    scope: 'project:demo',
    session_id: 'abc',
  });
  const calls = bodies.filter((b) => b.method === 'tools/call');
  assert.equal(calls[0].params.name, 'remember');
  assert.equal(calls[0].params.arguments.data, 'TYPE: session_capture\nshort fact');
  assert.equal(calls[0].params.arguments.dataset_name, 'main_dataset');
  assert.equal(calls[0].params.arguments.messages, undefined);
  assert.equal(calls[1].params.name, 'write');
  assert.equal(calls[1].params.arguments.uri, 'viking://resources/session-captures/demo/abc.md');
  assert.equal(calls[1].params.arguments.content, '## Session capture\nlong report');
  assert.equal(calls[1].params.arguments.mode, 'replace');
  assert.equal(calls[1].params.arguments.wait, true);
  assert.equal(calls[1].params.arguments.messages, undefined);
  assert.equal(calls[1].params.arguments.data, undefined);
  assert.ok(bodies.some((b) => b.method === 'initialize'));
  assert.ok(bodies.some((b) => b.method === 'notifications/initialized'));
  assert.ok(new Set(bodies.filter((b) => b.method === 'tools/call').map((b) => b.id)).size >= 2);

  const found = await adapters.recall({
    target: 'knowledge',
    uri: 'viking://resources/session-captures/demo/abc.md',
    idempotency_key: 'task=session-abc; agent=pi; date=2026-09-16; content_hash=deadbeef',
  });
  assert.equal(found, true);
  const readCall = bodies.filter((b) => b.method === 'tools/call' && b.params.name === 'read')[0];
  assert.deepEqual(readCall.params.arguments.uris, ['viking://resources/session-captures/demo/abc.md']);

  await adapters.recall({
    target: 'memory',
    correlation_id: 'corr-abc',
    idempotency_key: 'task=session-abc; agent=pi; date=2026-09-16; content_hash=deadbeef',
  });
  const memoryRecall = bodies.filter((b) => b.method === 'tools/call' && b.params.name === 'recall').at(-1);
  assert.equal(memoryRecall.params.arguments.search_type, 'CHUNKS');
  assert.equal(memoryRecall.params.arguments.query, 'corr-abc');
  assert.equal(memoryRecall.params.arguments.datasets, 'main_dataset');
  assert.ok(MCP_MUTATE_TIMEOUT_MS >= 20000);
});

test('missing OpenViking document is not treated as a verify hit', async () => {
  const adapters = createMcpAdapters(async () => ({
    ok: true,
    text: async () => 'event: message\ndata: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"File not found: viking://resources/session-captures/demo/abc.md"}],"isError":false}}\n\n',
  }));
  const found = await adapters.recall({
    target: 'knowledge',
    uri: 'viking://resources/session-captures/demo/abc.md',
    idempotency_key: 'task=session-abc; agent=pi; date=2026-09-16; content_hash=deadbeef',
  });
  assert.equal(found, false);
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
  assert.equal(pending.length, 2);
  assert.ok(pending.some((name) => name.includes('-memory-')));
  assert.ok(pending.some((name) => name.includes('-knowledge-')));
});

test('paired pending keeps two files; retry recall records', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-cap-'));
  let recalls = 0;
  const result = await captureSession({
    entries: substantialEntries,
    sessionId: 'retry-me',
    cwd: '/tmp/demo',
    profileDir: profile,
    distillerMode: 'off',
    remember: async () => ({ ok: true }),
    recall: async () => {
      recalls += 1;
      return recalls >= 2;
    },
    existsByKey: async () => false,
    sleep: async () => {},
  });
  assert.equal(result.status, 'recorded');
  assert.ok(recalls >= 2);
});

test('report-only confirm is UNCONFIRMED with an honest notify', async () => {
  const result = await captureSession({
    entries: substantialEntries,
    sessionId: 'half',
    cwd: '/tmp/demo',
    correlationId: 'corr-shared',
    distillerMode: 'off',
    remember: async (record) => ({ ok: record.target === 'knowledge' }),
    recall: async (record) => record.target === 'knowledge',
    existsByKey: async () => false,
    sleep: async () => {},
  });
  assert.equal(result.status, 'UNCONFIRMED');
  assert.equal(result.correlation_id, 'corr-shared');
  assert.equal(result.report.recorded, true);
  assert.equal(result.fact.recorded, false);
  assert.equal(formatWrapNotify(result), 'wrap: report recorded, fact pending (corr-shared)');
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

test('heuristic ignores incidental verification prose', () => {
  const distilled = distillHeuristic([
    { role: 'user', content: 'Please review the verification approach' },
    { tool: 'write', input: { path: 'lib/demo.mjs' } },
    { role: 'assistant', content: 'We discussed verification of the plan and also mentioned verif in passing.' },
  ]);
  assert.equal(distilled.verification.length, 0);
  const labeled = distillHeuristic([
    { role: 'assistant', content: 'verification: unit tests pass' },
  ]);
  assert.ok(labeled.verification.some((item) => /unit tests pass/i.test(item)));
});

test('MCP skill verification prose is not substantial and last user line wins as task', () => {
  const dumped = 'before the first call in the session to any MCP tool whose parameter names are not obvious from a short routine call (in particular every tool listed under *Parameter-rich tools — read the doc first* in `mcp-1c-tools/SKILL.md`), open the corresponding `docs/<server>.md`. Skipping this check and calling with a guessed parameter name is a defect.';
  const distilled = distillHeuristic([
    { role: 'user', content: 'first question' },
    { role: 'user', content: 'продолжи меня спрашивать' },
    { tool: 'read', input: { path: 'lib/x.mjs' } },
    { role: 'assistant', content: `verification: ${dumped}` },
  ]);
  assert.equal(distilled.task, 'продолжи меня спрашивать');
  assert.equal(distilled.verification.length, 0);
  assert.equal(isSubstantial(distilled), false);
});

test('stack mode calls the provider and empty/error falls back', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              task: 'Harden memory writes',
              locked_decisions: ['use document write'],
              files: ['lib/memory-mcp.mjs'],
              unresolved: [],
              verification: ['adapter tests'],
              findings: [],
              constraints: [],
              artifacts: ['lib/memory-mcp.mjs'],
              public_surface: [],
              tools: ['write'],
            }),
          },
        }],
      }),
    };
  };
  const distilled = await distillWithProvider({
    mode: 'stack',
    entries: substantialEntries,
    fetchImpl,
    env: {
      ROUTERAI_API_KEY: 'test-key',
      ROUTERAI_ENDPOINT: 'https://routerai.ru/api/v1',
      ROUTERAI_MODEL: 'qwen/qwen3.5-9b',
    },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /chat\/completions/);
  assert.equal(calls[0].body.model, 'qwen/qwen3.5-9b');
  assert.equal(distilled.fallback, false);
  assert.ok(distilled.locked_decisions.includes('use document write'));

  const ran = await runDistiller({
    mode: 'stack',
    entries: substantialEntries,
    distillWithProvider: async () => distilled,
  });
  assert.equal(ran.used, 'stack');
  assert.equal(ran.fallback, false);

  const down = await runDistiller({
    mode: 'stack',
    entries: substantialEntries,
    distillWithProvider: async () => {
      throw new Error('down');
    },
  });
  assert.equal(down.used, 'heuristic-fallback');
  assert.equal(down.fallback, true);

  const empty = parseDistillPayload('not json');
  assert.equal(empty, null);

  assert.equal(resolveStackProvider({ mode: 'stack', env: { ROUTERAI_API_KEY: '' } }).kind, 'ollama');
  await assert.rejects(() => distillWithProvider({
    mode: 'stack',
    entries: substantialEntries,
    fetchImpl: async () => { throw new Error('ollama down'); },
    env: { ROUTERAI_API_KEY: '' },
  }), /ollama down|stack provider/);
});

test('remote distill never receives exact project secrets or known credential families', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-distill-'));
  fs.writeFileSync(path.join(tmp, '.dev.env'), 'ERP_PROD_CREDENTIAL="s3cret value with spaces"\n');
  const entries = [
    { role: 'user', content: 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
    { role: 'assistant', content: 'use ERP_PROD_CREDENTIAL = "s3cret value with spaces" and GITLAB_TOKEN=glpat-0123456789abcdefghijkl' },
  ];
  const prompt = distillPromptEntries(entries, { cwd: tmp });
  assert.doesNotMatch(prompt, /s3cret value with spaces/);
  assert.doesNotMatch(prompt, /wJalrXUtnFEMI/);
  assert.doesNotMatch(prompt, /glpat-0123456789/);

  const calls = [];
  await distillWithProvider({
    mode: 'stack',
    entries,
    cwd: tmp,
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"task":"x"}' } }] }),
      };
    },
    env: {
      ROUTERAI_API_KEY: 'test-key',
      ROUTERAI_ENDPOINT: 'https://routerai.ru/api/v1',
    },
  });
  assert.equal(calls.length, 1);
  const body = JSON.stringify(calls[0]);
  assert.doesNotMatch(body, /s3cret value with spaces/);
  assert.doesNotMatch(body, /wJalrXUtnFEMI/);
  assert.doesNotMatch(body, /glpat-0123456789/);
});
