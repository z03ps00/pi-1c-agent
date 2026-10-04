import { createBudget, tryAdmit } from './budget.mjs';
import { createStats } from './stats.mjs';

function blank() {
  return {
    tools: [],
    decision: null,
    structuralCallSeen: false,
    loaded: { skills: [], rules: [], knowledge: [] },
    skipped: [],
    stats: createStats(),
    budget: createBudget(),
  };
}

let session = blank();

export function getSession() {
  return session;
}

export function noteTools(tools) {
  session.tools = Array.isArray(tools) ? tools : [];
  return session.tools;
}

export function setDecision(decision) {
  session.decision = decision;
  session.structuralCallSeen = false;
  return decision;
}

export function markStructuralCall() {
  session.structuralCallSeen = true;
}

export function beginTurn(kernelText, env = process.env) {
  const stats = session.stats;
  const tools = session.tools;
  session.budget = createBudget(env);
  session.loaded = { skills: [], rules: [], knowledge: [] };
  session.skipped = [];
  session.structuralCallSeen = false;
  tryAdmit(session.budget, { id: 'kernel', bucket: 'kernel', text: kernelText, protect: true }, stats);
  session.tools = tools;
  session.stats = stats;
  return session;
}

export function resetSessionForTests(env = process.env) {
  session = blank();
  session.budget = createBudget(env);
  return session;
}
