import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPlanArtifact,
  enterPlan,
  enterAsk,
  acceptPlan,
  executePlan,
  enterBuild,
  completeBuild,
  initialModeState,
  resolveDefaultMode,
  sanitizeModeState,
  normalizeAnonLevel,
  parseAnonLevel,
  cycleAnonLevel,
  anonBlocksMemoryWrites,
  anonBlocksMemoryReads,
  anonBlocksLocalTraces,
  isReadOnlyMode,
  DEFAULT_MODE,
} from '../lib/plan-state.mjs';

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

const PLAN_TEXT = `## Plan
1. Create /tmp/example in BUILD.
2. Initialize Pi resources.

## Files / objects expected to change
- /tmp/example — future directory

## Risks / edge cases
- Path permissions

## Verification
- Verify directory and Pi initialization`;

test('greenfield PLAN becomes ready without creating files', () => {
  const artifact = extractPlanArtifact(PLAN_TEXT);
  assert.equal(artifact.ready, true);
  let state = enterPlan(initialModeState());
  state = acceptPlan(state, artifact);
  assert.equal(state.phase, 'plan-ready');
  const sameId = state.plan.id;
  state = executePlan(state);
  assert.equal(state.mode, 'build');
  assert.equal(state.phase, 'build-executing');
  assert.equal(state.plan.id, sameId);
});

test('PLAN is not ready until all required sections exist', () => {
  const artifact = extractPlanArtifact('## Plan\n1. Do the thing');
  assert.equal(artifact.ready, false);
  assert.ok(artifact.missing.includes('## Verification'));
});

test('default mode is ASK unless env overrides', () => {
  withEnv('PI_1C_DEFAULT_MODE', undefined, () => {
    assert.equal(DEFAULT_MODE, 'ask');
    assert.equal(resolveDefaultMode(), 'ask');
    const state = initialModeState();
    assert.equal(state.mode, 'ask');
    assert.equal(state.phase, 'ask-idle');
    assert.equal(state.anonLevel, 0);
    assert.equal(state.approveLevel, 0);
    assert.equal(state.plan, null);
  });
  withEnv('PI_1C_DEFAULT_MODE', 'build', () => {
    assert.equal(resolveDefaultMode(), 'build');
    assert.equal(initialModeState().mode, 'build');
    assert.equal(initialModeState().phase, 'build-idle');
  });
  withEnv('PI_1C_DEFAULT_MODE', 'plan', () => {
    assert.equal(initialModeState().mode, 'plan');
  });
  withEnv('PI_1C_DEFAULT_MODE', 'nope', () => {
    assert.equal(resolveDefaultMode(), 'ask');
  });
});

test('enterAsk keeps a ready plan and is read-only', () => {
  const artifact = extractPlanArtifact(PLAN_TEXT);
  let state = enterPlan(initialModeState());
  state = acceptPlan(state, artifact);
  const id = state.plan.id;
  state = enterAsk(state);
  assert.equal(state.mode, 'ask');
  assert.equal(state.phase, 'ask-idle');
  assert.equal(state.plan.id, id);
  assert.equal(isReadOnlyMode('ask'), true);
  assert.equal(isReadOnlyMode('plan'), true);
  assert.equal(isReadOnlyMode('build'), false);
});

test('completeBuild leaves the execution phase', () => {
  const artifact = extractPlanArtifact(PLAN_TEXT);
  let state = acceptPlan(enterPlan(initialModeState()), artifact);
  state = executePlan(state);
  state = completeBuild(state);
  assert.equal(state.mode, 'build');
  assert.equal(state.phase, 'build-idle');
  assert.ok(state.plan?.id);
  assert.equal(completeBuild({ mode: 'ask', phase: 'ask-idle', plan: null }).phase, 'ask-idle');
});

test('sanitizeModeState degrades damaged records', () => {
  withEnv('PI_1C_DEFAULT_MODE', undefined, () => {
    const fallback = sanitizeModeState(null);
    assert.equal(fallback.mode, 'ask');
    assert.equal(fallback.anonLevel, 0);
    assert.equal(fallback.approveLevel, 0);

    const badMode = sanitizeModeState({ mode: 'fly', phase: 'plan-draft' });
    assert.equal(badMode.mode, 'ask');

    const noPlanReady = sanitizeModeState({ mode: 'plan', phase: 'plan-ready', plan: { id: '', text: '' } });
    assert.equal(noPlanReady.phase, 'plan-draft');
    assert.equal(noPlanReady.plan, null);

    const noPlanExec = sanitizeModeState({ mode: 'build', phase: 'build-executing', plan: null });
    assert.equal(noPlanExec.phase, 'build-idle');

    const garbageAnon = sanitizeModeState({ mode: 'build', phase: 'build-idle', plan: null, anonLevel: 'yes' });
    assert.equal(garbageAnon.anonLevel, 0);

    const kept = sanitizeModeState({
      mode: 'ask',
      phase: 'ask-idle',
      plan: { id: 'plan-abc', text: '## Plan\n1. x', stepCount: 1, createdAt: '2026-01-01' },
      anonLevel: 2,
      lastInjectedMode: 'ask',
    });
    assert.equal(kept.mode, 'ask');
    assert.equal(kept.anonLevel, 2);
    assert.equal(kept.plan.id, 'plan-abc');

    const coerced = sanitizeModeState({
      mode: 'build',
      phase: 'build-idle',
      plan: null,
      memoryGateRequired: 'yes',
    });
    assert.equal(coerced.memoryGateRequired, true);
  });
});

test('anon level helpers parse, cycle and classify', () => {
  assert.equal(normalizeAnonLevel(1), 1);
  assert.equal(normalizeAnonLevel('3'), 3);
  assert.equal(normalizeAnonLevel('9'), 0);
  assert.equal(normalizeAnonLevel('nope'), 0);
  assert.deepEqual(parseAnonLevel('status'), { kind: 'status' });
  assert.deepEqual(parseAnonLevel('off'), { kind: 'set', level: 0 });
  assert.deepEqual(parseAnonLevel('on'), { kind: 'set', level: 2 });
  assert.deepEqual(parseAnonLevel('1'), { kind: 'set', level: 1 });
  assert.equal(parseAnonLevel('xyz').kind, 'invalid');
  assert.equal(cycleAnonLevel(0), 1);
  assert.equal(cycleAnonLevel(3), 0);
  assert.equal(anonBlocksMemoryWrites(1), true);
  assert.equal(anonBlocksMemoryReads(1), false);
  assert.equal(anonBlocksMemoryReads(2), true);
  assert.equal(anonBlocksLocalTraces(2), false);
  assert.equal(anonBlocksLocalTraces(3), true);
});

test('enterBuild with a plan starts executing', () => {
  const artifact = extractPlanArtifact(PLAN_TEXT);
  let state = acceptPlan(enterPlan(initialModeState()), artifact);
  state = enterBuild(state);
  assert.equal(state.mode, 'build');
  assert.equal(state.phase, 'build-executing');
});
