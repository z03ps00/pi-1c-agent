import {
  acquireProfileSlot,
  acquireResourceLeases,
  releaseLease,
  releaseResource,
  runtimeProfileDir,
  startLeaseHeartbeat,
} from './runtime-scheduler.mjs';

const waiters = [];
let inFlight = 0;

export function maxSubagents(env = process.env) {
  const n = Number(env.PI_1C_MAX_SUBAGENTS ?? 4);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 4;
}

export function subagentInFlight() {
  return inFlight;
}

function pump() {
  const limit = maxSubagents();
  while (waiters.length && inFlight < limit) {
    inFlight += 1;
    const next = waiters.shift();
    next();
  }
}

export function acquireSubagentSlot() {
  return new Promise((resolve) => {
    waiters.push(resolve);
    pump();
  });
}

export function releaseSubagentSlot() {
  inFlight = Math.max(0, inFlight - 1);
  pump();
}

export async function withSubagentSlot(fn, {
  profileDir,
  agent,
  scopeKey = 'default',
  env = process.env,
} = {}) {
  await acquireSubagentSlot();
  const root = profileDir ? runtimeProfileDir(env, profileDir) : '';
  let slot;
  let resources = [];
  let heartbeat;
  try {
    if (root) {
      slot = await acquireProfileSlot(root);
      if (agent) resources = await acquireResourceLeases(root, agent, { scopeKey });
      heartbeat = startLeaseHeartbeat([slot, ...resources]);
    }
    return await fn();
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    for (const lease of resources) releaseResource(lease);
    if (slot) releaseLease(slot);
    releaseSubagentSlot();
  }
}

export function resetSubagentBudgetForTests() {
  waiters.length = 0;
  inFlight = 0;
}
