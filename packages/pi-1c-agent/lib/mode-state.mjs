import { emitDiagnostic } from './diagnostics.mjs';

export const MODES = Object.freeze(['ask', 'plan', 'build']);

const SHARED_KEY = '__PI_1C_MODE__';
let uninitializedLogged = false;

function shared() {
  return globalThis;
}

export function set1cMode(mode) {
  const value = String(mode ?? '').trim().toLowerCase();
  if (value === 'ask' || value === 'plan' || value === 'build') {
    shared()[SHARED_KEY] = value;
    return value;
  }
  throw new Error(`Unknown 1C mode: ${mode}. Use plan, build, or ask.`);
}

export function current1cMode() {
  const value = shared()[SHARED_KEY];
  if (value === 'ask' || value === 'plan' || value === 'build') return value;
  if (!uninitializedLogged) {
    uninitializedLogged = true;
    emitDiagnostic('mode-state-not-initialized', { value: value ?? null });
  }
  return 'ask';
}

export function isBuildMode() {
  return current1cMode() === 'build';
}

export function requireBuild(action = 'Mutation') {
  if (current1cMode() === 'build') return true;
  throw new Error(`${action} requires explicit BUILD mode`);
}

export function resetModeStateForTests() {
  delete shared()[SHARED_KEY];
  uninitializedLogged = false;
}
