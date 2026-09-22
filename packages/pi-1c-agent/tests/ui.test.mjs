import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uiAvailable,
  hasDialogUi,
  composeFooter,
  footerSegments,
  FOOTER_DROP_ORDER,
  composeStatus,
  mapRunStatus,
  composeAgentCard,
  composeAgentCardLines,
  composeHubRows,
  composeWidgetLines,
  RunTracker,
  composeWorkflowView,
  composeWorkflowResult,
  PALETTE_ACTIONS,
  PALETTE_SHORTCUT,
  filterPaletteActions,
  paletteBindsCtrlK,
  composeApprovalView,
  summarizeToolAction,
  APPROVE_ALL,
  wizardProgress,
  composeInitPreviewSummary,
  SOURCE_EMPTY,
  SOURCE_DUMP,
  SOURCE_QUESTION,
  publish,
  getSnapshot,
  resetUiBusForTests,
  stripAnsi,
  colorize,
} from '../lib/ui/index.mjs';

test('uiAvailable requires hasUI and tui mode', () => {
  assert.equal(uiAvailable(null), false);
  assert.equal(uiAvailable({ hasUI: true }), false);
  assert.equal(uiAvailable({ hasUI: true, mode: 'rpc' }), false);
  assert.equal(uiAvailable({ hasUI: false, mode: 'tui' }), false);
  assert.equal(uiAvailable({ hasUI: true, mode: 'tui' }), true);
  assert.equal(hasDialogUi({ hasUI: true, mode: 'rpc' }), true);
});

test('footer BUILD omits default-off flags', () => {
  const { text, segments } = composeFooter({
    mode: 'build',
    approve: 'safe',
    anonLevel: 0,
    rotateEnabled: false,
    captureEnabled: false,
    contextPercent: 58,
    gitBranch: 'main',
    model: 'claude-sonnet',
    projectName: 'ERP 2.5',
  }, 120);
  assert.match(text, /BUILD/);
  assert.match(text, /safe/);
  assert.doesNotMatch(text, /anon:off/);
  assert.doesNotMatch(text, /rotate:off/);
  assert.doesNotMatch(text, /capture:off/);
  assert.doesNotMatch(text, /approve:off/);
  assert.ok(segments.some((s) => s.id === 'mode'));
});

test('footer PLAN shows read-only and plan id', () => {
  const { text } = composeFooter({
    mode: 'plan',
    planId: 'plan-4f21a8',
    anonLevel: 0,
    contextPercent: 42,
    gitBranch: 'main',
  }, 120);
  assert.match(text, /PLAN/);
  assert.match(text, /чтение/);
  assert.match(text, /план #4f21a8/);
});

test('footer ASK shows ANON only when enabled', () => {
  const on = composeFooter({ mode: 'ask', anonLevel: 2, contextPercent: 21 }, 120);
  assert.match(on.text, /ASK/);
  assert.match(on.text, /ANON 2/);
  const off = composeFooter({ mode: 'ask', anonLevel: 0, contextPercent: 21 }, 120);
  assert.doesNotMatch(off.text, /ANON/);
  assert.doesNotMatch(off.text, /anon:off/);
});

test('responsive footer never exceeds width and keeps mode', () => {
  const snap = {
    mode: 'build',
    approve: 'safe',
    projectName: 'Rehau ERP 2.5',
    contextPercent: 58,
    gitBranch: 'main',
    model: 'claude-sonnet-4-5',
  };
  const wide = composeFooter(snap, 100);
  assert.match(wide.text, /BUILD/);
  assert.ok(wide.text.length <= 100);
  const narrow = composeFooter(snap, 18);
  assert.match(narrow.text, /BUILD/);
  assert.ok(narrow.text.length <= 18);
  assert.ok(narrow.dropped.length >= wide.dropped.length);
});

test('colorless footer still contains BUILD', () => {
  const { text } = composeFooter({ mode: 'build', approve: 'safe' }, 80);
  assert.match(stripAnsi(text), /BUILD/);
  const themed = colorize({ fg: (token, t) => `\x1b[32m${t}\x1b[0m` }, 'success', 'BUILD');
  assert.match(stripAnsi(themed), /BUILD/);
  assert.match(themed, /\x1b\[32m/);
});

test('status screen includes mode, context, and running agents', () => {
  const text = composeStatus({
    projectName: 'ERP Rehau',
    configuration: 'ERP 2.5',
    mode: 'build',
    approve: 'safe',
    anonLevel: 0,
    contextPercent: 58,
    gitBranch: 'main',
    agents: [
      { agent: '1c-developer', status: 'working' },
      { agent: '1c-tester', status: 'testing' },
    ],
    knowledge: 'initialized',
    fingerprint: 'current',
  });
  assert.match(text, /BUILD/);
  assert.match(text, /58%/);
  assert.match(text, /2 в работе/);
  assert.match(text, /developer/);
  assert.match(text, /tester/);
});

test('mapRunStatus covers hub states', () => {
  assert.equal(mapRunStatus({ event: 'spawn' }), 'starting');
  assert.equal(mapRunStatus({ event: 'progress', activity: 'editing module' }), 'working');
  assert.equal(mapRunStatus({ event: 'progress', agentName: '1c-tester', activity: 'YaxUnit 14/22' }), 'testing');
  assert.equal(mapRunStatus({ event: 'progress', agentName: '1c-code-reviewer' }), 'reviewing');
  assert.equal(mapRunStatus({ event: 'wait' }), 'waiting');
  assert.equal(mapRunStatus({ event: 'done', ok: true }), 'completed');
  assert.equal(mapRunStatus({ event: 'done', ok: false }), 'failed');
  assert.equal(mapRunStatus({ aborted: true }), 'cancelled');
});

test('agent cards collapse success and surface failure', () => {
  const now = 1_000_000;
  const ok = composeAgentCardLines({ agent: '1c-developer', status: 'completed', startedAt: now - 31000, endedAt: now }, now);
  assert.equal(ok.length, 1);
  assert.match(ok[0], /developer/);
  assert.match(ok[0], /готово/);
  const fail = composeAgentCardLines({ agent: '1c-developer', status: 'failed', startedAt: now - 12000, endedAt: now, error: 'Invalid handoff' }, now);
  assert.match(fail[0], /ошибка/);
  assert.match(fail[0], /12с/);
  assert.match(fail[1], /Invalid handoff/);
  const running = composeAgentCard({ agent: '1c-developer', status: 'working', activity: 'ЗагрузкаКурсовВалют', startedAt: now - 24000 }, now);
  assert.equal(running.status, 'working');
  assert.match(running.duration, /с/);
});

test('hub rows mix discovered idle agents with live runs', () => {
  const rows = composeHubRows(
    [{ name: '1c-developer', writer: true }, { name: '1c-reviewer', writer: false }],
    [{ agent: '1c-developer', status: 'working', activity: 'editing', startedAt: Date.now() - 1000, kind: 'writer' }],
  );
  const dev = rows.find((r) => r.name === 'developer');
  const rev = rows.find((r) => r.name === 'reviewer');
  assert.equal(dev.status, 'working');
  assert.equal(dev.stoppable, true);
  assert.equal(rev.status, 'idle');
});

test('widget lists running agents and hides when idle', () => {
  const now = Date.now();
  const lines = composeWidgetLines([
    { agent: '1c-developer', status: 'working', activity: 'editing ЗагрузкаКурсовВалют', startedAt: now },
    { agent: '1c-tester', status: 'testing', activity: 'YaxUnit 14/22', startedAt: now },
  ], now);
  assert.match(lines[0], /2 в работе/);
  assert.match(lines.join('\n'), /developer/);
  assert.deepEqual(composeWidgetLines([]), []);
});

test('footer drop order keeps mode and approval longer than model/bar', () => {
  assert.equal(FOOTER_DROP_ORDER[0], 'bar');
  assert.equal(FOOTER_DROP_ORDER[1], 'model');
  assert.ok(!FOOTER_DROP_ORDER.includes('mode'));
  const snap = { mode: 'build', approve: 'safe', model: 'claude-sonnet', projectName: 'ERP', contextPercent: 58 };
  const { segments, dropped } = composeFooter(snap, 28);
  assert.ok(segments.some((s) => s.id === 'mode'));
  assert.ok(dropped.some((s) => s.id === 'bar' || s.id === 'model'));
});

test('run tracker keeps discovered agents when a run starts', () => {
  resetUiBusForTests();
  const tracker = new RunTracker({ publish });
  tracker.setDiscovered([{ name: '1c-developer', writer: true }]);
  tracker.start({ agent: '1c-developer', kind: 'writer' });
  assert.equal(getSnapshot('agents').discovered[0].name, '1c-developer');
  assert.equal(getSnapshot('agents').runs[0].status, 'starting');
});

test('headless hosts skip overlays', () => {
  assert.equal(uiAvailable({ hasUI: false, mode: 'print' }), false);
  assert.equal(uiAvailable({ hasUI: true, mode: 'rpc' }), false);
  assert.equal(hasDialogUi({ hasUI: true, mode: 'rpc' }), true);
});

test('run tracker publishes snapshots and stop aborts', () => {
  resetUiBusForTests();
  const ac = new AbortController();
  const tracker = new RunTracker({ publish });
  const id = tracker.start({ agent: '1c-developer', kind: 'writer', abort: ac });
  assert.equal(getSnapshot('agents').runs[0].status, 'starting');
  tracker.update(id, { status: 'working', activity: 'edit' });
  assert.equal(tracker.stop(id), true);
  assert.equal(ac.signal.aborted, true);
  tracker.finish(id, { aborted: true });
  assert.equal(tracker.get(id).status, 'cancelled');
});

test('workflow pipeline mid-state and failed stage', () => {
  const mid = composeWorkflowView({
    workflow: 'implementation',
    stages: [
      { agent: '1c-architect', status: 'completed', duration: '18s' },
      { agent: '1c-developer', status: 'working', activity: 'editing' },
      { agent: '1c-tester', status: 'idle' },
      { agent: '1c-reviewer', status: 'idle' },
    ],
    currentIndex: 1,
  });
  assert.match(mid.lines.join('\n'), /architect/);
  assert.match(mid.lines.join('\n'), /developer/);
  assert.match(mid.lines.join('\n'), /●/);
  const failed = composeWorkflowView({
    workflow: 'implementation',
    stages: [
      { agent: '1c-architect', status: 'completed' },
      { agent: '1c-developer', status: 'failed', error: 'Invalid handoff' },
      { agent: '1c-tester', status: 'idle' },
    ],
  });
  assert.equal(failed.failedStage, '1c-developer');
  assert.doesNotMatch(failed.lines.join('\n'), /tester.*completed/);
  const done = composeWorkflowResult({
    workflow: 'implementation',
    startedAt: Date.now() - 103000,
    endedAt: Date.now(),
    stages: [
      { agent: 'a', status: 'completed' },
      { agent: 'b', status: 'completed' },
    ],
  }, { expanded: false });
  assert.match(done[0], /завершён/);
});

test('palette fuzzy match and does not bind ctrl+k', () => {
  const hits = filterPaletteActions('mod');
  assert.ok(hits.some((a) => a.id === 'mode'));
  const ids = PALETTE_ACTIONS.map((a) => a.id);
  for (const need of ['mode', 'agents', 'status', 'doctor', 'init', 'config', 'memory', 'session', 'approve', 'anon', 'settings']) {
    assert.ok(ids.includes(need), need);
  }
  assert.equal(PALETTE_SHORTCUT, 'ctrl+shift+k');
  assert.equal(paletteBindsCtrlK(), false);
});

test('approval view keeps policy choice values', () => {
  const view = composeApprovalView({
    toolName: 'bash',
    action: summarizeToolAction('bash', { command: 'git reset --hard HEAD~1' }),
    reason: 'This may discard local changes',
  });
  assert.equal(view.fields[0].value, 'bash');
  assert.match(view.fields[1].value, /git reset --hard/);
  assert.equal(view.choices[1].value, APPROVE_ALL);
});

test('init wizard copy and progress', () => {
  assert.match(SOURCE_QUESTION, /Источник проекта/);
  assert.match(SOURCE_EMPTY, /Пустая структура исходников/);
  assert.match(SOURCE_DUMP, /Выгрузка из существующей ИБ/);
  const progress = wizardProgress(0);
  assert.match(progress, /Источник/);
  const preview = composeInitPreviewSummary({ source: 'empty', knowledge: true, files: ['.dev.env'] });
  assert.match(preview, /Готово к инициализации/);
  assert.match(preview, /\.dev\.env/);
});

test('ui bus is not session state', () => {
  resetUiBusForTests();
  publish('mode', { mode: 'build' });
  assert.equal(getSnapshot('mode').mode, 'build');
  resetUiBusForTests();
  assert.equal(getSnapshot('mode'), undefined);
});
