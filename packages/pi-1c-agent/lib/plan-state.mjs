import crypto from 'node:crypto';

export const PLAN_REQUIRED_SECTIONS = [
  '## Plan',
  '## Files / objects expected to change',
  '## Risks / edge cases',
  '## Verification',
];

export const READ_ONLY_MODES = Object.freeze(['plan', 'ask']);

export const ANON_MAX_LEVEL = 3;

/** Startup default when env/flag do not override. */
export const DEFAULT_MODE = 'ask';

const MODE_PHASES = Object.freeze({
  plan: 'plan-draft',
  ask: 'ask-idle',
  build: 'build-idle',
});

export function isReadOnlyMode(mode) {
  return READ_ONLY_MODES.includes(mode);
}

export function resolveDefaultMode(raw = process.env.PI_1C_DEFAULT_MODE) {
  const t = String(raw ?? '').trim().toLowerCase();
  if (t === 'plan' || t === 'build' || t === 'ask') return t;
  return DEFAULT_MODE;
}

export function extractPlanArtifact(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('## Plan');
  if (start < 0) return null;
  const artifact = text.slice(start).trim();
  const missing = PLAN_REQUIRED_SECTIONS.filter((h) => !artifact.includes(h));
  const numberedSteps = artifact.match(/^\s*\d+\.\s+.+$/gm) ?? [];
  if (missing.length || numberedSteps.length === 0) {
    return { ready: false, artifact, missing, stepCount: numberedSteps.length };
  }
  const hash = crypto.createHash('sha256').update(artifact).digest('hex').slice(0, 12);
  return { ready: true, artifact, missing: [], stepCount: numberedSteps.length, id: `plan-${hash}` };
}

export function normalizeAnonLevel(value) {
  const raw = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(raw)) return 0;
  const level = Math.trunc(raw);
  return level >= 1 && level <= ANON_MAX_LEVEL ? level : 0;
}

/** Parses a `/anon` argument: { kind: 'status' | 'set' | 'invalid', level? }. */
export function parseAnonLevel(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t || t === 'status') return { kind: 'status' };
  if (t === 'off' || t === '0' || t === 'no' || t === 'false') return { kind: 'set', level: 0 };
  if (t === 'on' || t === 'yes' || t === 'true') return { kind: 'set', level: 2 };
  if (/^[123]$/.test(t)) return { kind: 'set', level: Number.parseInt(t, 10) };
  return { kind: 'invalid' };
}

/** Hotkey cycle: 0 → 1 → 2 → 3 → 0. */
export function cycleAnonLevel(level) {
  const current = normalizeAnonLevel(level);
  return current >= ANON_MAX_LEVEL ? 0 : current + 1;
}

export function anonBlocksMemoryWrites(level) {
  return normalizeAnonLevel(level) >= 1;
}

export function anonBlocksMemoryReads(level) {
  return normalizeAnonLevel(level) >= 2;
}

export function anonBlocksLocalTraces(level) {
  return normalizeAnonLevel(level) >= 3;
}

export function initialModeState() {
  const mode = resolveDefaultMode();
  return { mode, phase: MODE_PHASES[mode], plan: null, anonLevel: 0 };
}

export function enterPlan(state = initialModeState()) {
  return { ...state, mode: 'plan', phase: 'plan-draft', plan: null };
}

export function enterAsk(state = initialModeState()) {
  return { ...state, mode: 'ask', phase: 'ask-idle' };
}

export function acceptPlan(state, artifactResult) {
  if (!artifactResult?.ready) return { ...state, mode: 'plan', phase: 'plan-draft' };
  return {
    ...state,
    mode: 'plan',
    phase: 'plan-ready',
    plan: {
      id: artifactResult.id,
      text: artifactResult.artifact,
      stepCount: artifactResult.stepCount,
      createdAt: new Date().toISOString(),
    },
  };
}

export function executePlan(state) {
  if (!state?.plan?.id) throw new Error('No ready plan to execute');
  return { ...state, mode: 'build', phase: 'build-executing' };
}

export function enterBuild(state = initialModeState()) {
  return { ...state, mode: 'build', phase: state?.plan ? 'build-executing' : 'build-idle' };
}

export function completeBuild(state = initialModeState()) {
  if (state.mode !== 'build' || state.phase !== 'build-executing') return state;
  return { ...state, phase: 'build-idle' };
}

/**
 * Validates a state restored from a session record. A damaged or outdated
 * record must not crash session_start or leave an inconsistent mode/phase pair.
 */
export function sanitizeModeState(candidate) {
  const fallback = initialModeState();
  if (!candidate || typeof candidate !== 'object') return fallback;
  const mode = candidate.mode;
  if (mode !== 'plan' && mode !== 'build' && mode !== 'ask') return fallback;
  const phase = candidate.phase;
  const knownPhases = ['build-idle', 'build-executing', 'plan-draft', 'plan-ready', 'ask-idle'];
  const nextPhase = knownPhases.includes(phase) ? phase : MODE_PHASES[mode];
  let plan = null;
  const raw = candidate.plan;
  if (raw && typeof raw === 'object' && typeof raw.id === 'string' && raw.id.trim() && typeof raw.text === 'string') {
    plan = {
      id: raw.id,
      text: raw.text,
      stepCount: Number.isFinite(raw.stepCount) ? raw.stepCount : 0,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    };
  }
  const state = {
    ...fallback,
    ...candidate,
    mode,
    phase: nextPhase,
    plan,
    anonLevel: normalizeAnonLevel(candidate.anonLevel),
  };
  for (const flag of [
    'memoryGateRequired', 'memoryGatePrompted',
    'dashboardGateRequired', 'dashboardGatePrompted',
    'recallGateRequired', 'recallGatePrompted',
  ]) {
    if (flag in state) state[flag] = Boolean(state[flag]);
  }
  if (mode === 'build' && state.phase === 'build-executing' && !plan) state.phase = 'build-idle';
  if (mode === 'plan' && state.phase === 'plan-ready' && !plan) state.phase = 'plan-draft';
  if (mode === 'ask' && state.phase !== 'ask-idle') state.phase = 'ask-idle';
  return state;
}
