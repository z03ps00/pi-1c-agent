import test from 'node:test';
import assert from 'node:assert/strict';
import { current1cMode, isBuildMode, requireBuild, resetModeStateForTests, set1cMode } from '../lib/mode-state.mjs';
import { diagnosticEvents, resetDiagnostics } from '../lib/diagnostics.mjs';

test('missing mode fails closed to ASK and denies mutation', () => {
  resetDiagnostics();
  resetModeStateForTests();
  assert.equal(current1cMode(), 'ask');
  assert.equal(isBuildMode(), false);
  assert.throws(() => requireBuild('write'), /BUILD/);
  assert.ok(diagnosticEvents().some((e) => e.code === 'mode-state-not-initialized'));
});

test('malformed mode fails closed to ASK', () => {
  resetModeStateForTests();
  globalThis.__PI_1C_MODE__ = 'debug';
  assert.equal(current1cMode(), 'ask');
  assert.throws(() => requireBuild(), /BUILD/);
});

test('explicit BUILD permits mutation', () => {
  resetModeStateForTests();
  set1cMode('build');
  assert.equal(current1cMode(), 'build');
  assert.equal(requireBuild(), true);
});

test('ask and plan are consistent for every caller', () => {
  resetModeStateForTests();
  set1cMode('plan');
  assert.equal(current1cMode(), 'plan');
  assert.equal(current1cMode(), 'plan');
  set1cMode('ask');
  assert.equal(current1cMode(), 'ask');
});
