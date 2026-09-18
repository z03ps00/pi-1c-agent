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

export async function withSubagentSlot(fn) {
  await acquireSubagentSlot();
  try {
    return await fn();
  } finally {
    releaseSubagentSlot();
  }
}

export function resetSubagentBudgetForTests() {
  waiters.length = 0;
  inFlight = 0;
}
