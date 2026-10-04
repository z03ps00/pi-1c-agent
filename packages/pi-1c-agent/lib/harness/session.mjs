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
    trace: [],
    prompt: '',
    verification: null,
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
  session.trace = [];
  session.prompt = '';
  session.verification = null;
  return session;
}

export function notePrompt(text) {
  session.prompt = String(text || '');
  return session.prompt;
}

export function noteTrace(entry) {
  if (!entry?.name) return session.trace;
  session.trace.push({
    name: String(entry.name),
    dangerous: Boolean(entry.dangerous),
    role: entry.role ? String(entry.role) : '',
  });
  return session.trace;
}

export function noteVerification(ok) {
  if (ok === false) session.verification = 'fail';
  else if (session.verification !== 'fail') session.verification = 'pass';
  return session.verification;
}

export function resetSessionForTests(env = process.env) {
  session = blank();
  session.budget = createBudget(env);
  return session;
}
