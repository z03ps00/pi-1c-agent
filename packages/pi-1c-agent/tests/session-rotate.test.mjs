import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_THRESHOLD,
  STATE_CUSTOM_TYPE,
  THRESHOLD_RANGE_MESSAGE,
  applyCommand,
  buildHandoffInstruction,
  buildKickoff,
  defaultHandoffPath,
  defaultState,
  footerLabel,
  handoffContainsSecrets,
  handoffReady,
  parseSessionRotateArgs,
  restoreStateFromEntries,
  rotationNewSessionOptions,
  midTurnBlockReason,
  shouldArmMidTurnRotation,
  shouldCancelCompact,
  shouldDeferRotationAfterOverflow,
  shouldRotateOnIdle,
  statusText,
} from '../lib/session-rotate.mjs';

test('feature is off by default and does not cancel compaction', () => {
  const state = defaultState();
  assert.equal(state.enabled, false);
  assert.equal(state.thresholdPercent, DEFAULT_THRESHOLD);
  assert.equal(shouldCancelCompact({ enabled: state.enabled, reason: 'threshold', isIdle: true }), false);
  assert.equal(shouldRotateOnIdle({ enabled: state.enabled, percent: 90, thresholdPercent: state.thresholdPercent }), false);
});

test('enable/disable, custom threshold, status, invalid threshold rejected', () => {
  let state = defaultState();
  const on = applyCommand(state, parseSessionRotateArgs('on'));
  assert.equal(on.ok, true);
  assert.equal(on.state.enabled, true);
  assert.equal(on.state.thresholdPercent, 85);
  state = on.state;

  const eighty = applyCommand(state, parseSessionRotateArgs('80'));
  assert.equal(eighty.ok, true);
  assert.equal(eighty.state.enabled, true);
  assert.equal(eighty.state.thresholdPercent, 80);
  state = eighty.state;

  const status = applyCommand(state, parseSessionRotateArgs('status'));
  assert.equal(status.ok, true);
  assert.equal(status.changed, false);
  assert.match(statusText(status.state), /on/);
  assert.match(statusText(status.state), /80%/);

  const bad = applyCommand(state, parseSessionRotateArgs('49'));
  assert.equal(bad.ok, false);
  assert.equal(bad.state.thresholdPercent, 80);
  assert.equal(bad.error, THRESHOLD_RANGE_MESSAGE);

  const tooHigh = applyCommand(state, parseSessionRotateArgs('96'));
  assert.equal(tooHigh.ok, false);
  assert.equal(tooHigh.state.thresholdPercent, 80);

  const off = applyCommand(state, parseSessionRotateArgs('off'));
  assert.equal(off.state.enabled, false);
  assert.equal(off.state.thresholdPercent, 80);
});

test('state persists across resume and carries into a new session snapshot', () => {
  const enabled = applyCommand(defaultState(), parseSessionRotateArgs('on 72')).state;
  const entries = [
    { type: 'message' },
    { type: 'custom', customType: STATE_CUSTOM_TYPE, data: { state: defaultState() } },
    { type: 'custom', customType: STATE_CUSTOM_TYPE, data: { state: enabled } },
  ];
  const restored = restoreStateFromEntries(entries);
  assert.equal(restored.enabled, true);
  assert.equal(restored.thresholdPercent, 72);

  const kickoff = buildKickoff('/tmp/handoffs/handoff-x.md');
  const opts = rotationNewSessionOptions({ parentSession: '/old/session.jsonl', state: restored, kickoff });
  assert.equal(opts.parentSession, '/old/session.jsonl');
  assert.equal(opts.setupState.customType, STATE_CUSTOM_TYPE);
  assert.deepEqual(opts.setupState.data.state, enabled);
  assert.match(opts.kickoff, /handoff-x\.md/);
  assert.match(opts.kickoff, /do not repeat completed discovery/);
});

test('threshold compaction cancelled once when armed and idle; overflow allowed', () => {
  const enabled = true;
  assert.equal(shouldCancelCompact({ enabled, reason: 'threshold', isIdle: true }), true);
  assert.equal(shouldCancelCompact({ enabled, reason: 'threshold', isIdle: true, alreadyCancelledForRotation: true }), false);
  assert.equal(shouldCancelCompact({ enabled, reason: 'threshold', isIdle: false }), false);
  assert.equal(shouldCancelCompact({ enabled, reason: 'overflow', isIdle: true }), false);
  assert.equal(shouldCancelCompact({ enabled, reason: 'manual', isIdle: true }), false);
  assert.equal(shouldDeferRotationAfterOverflow({ enabled, reason: 'overflow' }), true);
  assert.equal(shouldDeferRotationAfterOverflow({ enabled, reason: 'threshold' }), false);
});

test('rotation requires a non-empty secret-free handoff; abort reasons are explicit', () => {
  assert.deepEqual(handoffReady(null), { ok: false, reason: 'missing' });
  assert.deepEqual(handoffReady('   '), { ok: false, reason: 'empty' });
  assert.equal(handoffContainsSecrets('# Handoff\npassword: hunter2'), true);
  assert.deepEqual(handoffReady('# Handoff\nIB_PASSWORD=secret'), { ok: false, reason: 'secrets' });
  assert.equal(handoffContainsSecrets('# Handoff\n## Next Steps\n- Finish the document'), false);
  assert.deepEqual(handoffReady('# Handoff\n## Next Steps\n- Finish the document'), { ok: true });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-1c-rotate-'));
  const missing = path.join(dir, 'missing.md');
  let text = '';
  try { text = fs.readFileSync(missing, 'utf8'); } catch { text = ''; }
  assert.equal(handoffReady(text).ok, false);

  const file = path.join(dir, 'handoff.md');
  fs.writeFileSync(file, '# Handoff: continue\n\n## Next Steps\n1. Finish the module.\n');
  assert.equal(handoffReady(fs.readFileSync(file, 'utf8')).ok, true);

  const kickoff = buildKickoff(file);
  const opts = rotationNewSessionOptions({ parentSession: 'parent.jsonl', state: { enabled: true, thresholdPercent: 85 }, kickoff });
  assert.equal(opts.parentSession, 'parent.jsonl');
  assert.match(buildHandoffInstruction(file), /handoff skill/);
});

test('null context percent does not rotate; percent at/above threshold does', () => {
  const enabled = true;
  const thresholdPercent = 85;
  assert.equal(shouldRotateOnIdle({ enabled, percent: null, thresholdPercent }), false);
  assert.equal(shouldRotateOnIdle({ enabled, percent: undefined, thresholdPercent }), false);
  assert.equal(shouldRotateOnIdle({ enabled, percent: 84, thresholdPercent }), false);
  assert.equal(shouldRotateOnIdle({ enabled, percent: 85, thresholdPercent }), true);
  assert.equal(shouldRotateOnIdle({ enabled, percent: 90, thresholdPercent, alreadyRotating: true }), false);
});

test('mid-turn guard arms only when enabled, streaming, and at/above threshold', () => {
  const thresholdPercent = 85;
  const base = { enabled: true, percent: 90, thresholdPercent, isIdle: false, handoffPending: false, rotating: false };
  assert.equal(shouldArmMidTurnRotation({ ...base, enabled: false }), false);
  assert.equal(shouldArmMidTurnRotation({ ...base, isIdle: true }), false);
  assert.equal(shouldArmMidTurnRotation({ ...base, handoffPending: true }), false);
  assert.equal(shouldArmMidTurnRotation({ ...base, rotating: true }), false);
  assert.equal(shouldArmMidTurnRotation({ ...base, percent: null }), false);
  assert.equal(shouldArmMidTurnRotation({ ...base, percent: undefined }), false);
  assert.equal(shouldArmMidTurnRotation({ ...base, percent: 84 }), false);
  assert.equal(shouldArmMidTurnRotation(base), true);
  assert.equal(shouldArmMidTurnRotation({ ...base, percent: 85 }), true);
  const reason = midTurnBlockReason(90, 85);
  assert.match(reason, /90%/);
  assert.match(reason, /85%/);
  assert.match(reason, /new session/);
});

test('footer label and cursor status wording', () => {
  assert.equal(footerLabel(defaultState()), 'rotate off 85%');
  assert.equal(footerLabel({ enabled: true, thresholdPercent: 85 }), 'rotate on 85%');
  assert.match(statusText(defaultState(), 'cursor'), /does not activate/);
});

test('default handoff path uses local timestamp filename', () => {
  const p = defaultHandoffPath('/tmp/proj', new Date(2026, 8, 15, 1, 2, 3));
  assert.equal(p, '/tmp/proj/handoffs/handoff-20260915-010203.md');
});
