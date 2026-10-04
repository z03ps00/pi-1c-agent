import fs from 'node:fs';
import path from 'node:path';
import { hasUnredactableSecret, redact } from '../redact.mjs';
import { prepareWrite } from '../memory-write.mjs';
import { queuePendingRecord } from '../memory-reconcile.mjs';

export const DRAFT_THRESHOLD = 3;
export const SIGNAL_TYPES = Object.freeze([
  'wrong_tool',
  'fallback',
  'action_sequence',
  'reviewer_finding',
  'bsl_error',
  'config_procedure',
]);

export function evolutionDir(profileDir) {
  return path.join(profileDir, 'state', 'evolution');
}

function journalPath(profileDir) {
  return path.join(evolutionDir(profileDir), 'friction.json');
}

function draftsDir(profileDir) {
  return path.join(evolutionDir(profileDir), 'drafts');
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function fingerprintSignal(signal = {}) {
  if (!SIGNAL_TYPES.includes(signal.type)) return '';
  const redacted = redact(String(signal.subject ?? ''));
  if (hasUnredactableSecret(redacted.text)) return `${signal.type}|[redacted]`;
  const subject = redacted.text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
  return `${signal.type}|${subject}`;
}

function kindFor(type) {
  if (type === 'reviewer_finding') return 'rule';
  if (type === 'action_sequence') return 'workflow';
  if (type === 'config_procedure') return 'prompt';
  return 'skill';
}

export function observeFriction(profileDir, signal = {}) {
  const id = fingerprintSignal(signal);
  if (!id) return { ok: false, reason: 'ignored signal', draft: null };
  const journal = readJson(journalPath(profileDir), { signals: {} });
  const current = journal.signals[id] || { type: signal.type, subject: id.split('|').slice(1).join('|'), count: 0 };
  current.count += 1;
  journal.signals[id] = current;
  writeJson(journalPath(profileDir), journal);
  if (current.count < DRAFT_THRESHOLD) return { ok: true, count: current.count, draft: null, activated: false };
  const draft = ensureDraft(profileDir, { fingerprint: id, kind: kindFor(signal.type), subject: current.subject });
  return { ok: true, count: current.count, draft, activated: false };
}

export function ensureDraft(profileDir, { fingerprint, kind, subject }) {
  const dir = draftsDir(profileDir);
  fs.mkdirSync(dir, { recursive: true });
  const safe = fingerprint.replace(/[^a-z0-9|._-]+/gi, '_').slice(0, 80);
  const file = path.join(dir, `${kind}-${safe}.json`);
  if (fs.existsSync(file)) return readJson(file, null);
  const draft = {
    id: `${kind}-${safe}`,
    kind,
    status: 'draft',
    subject,
    fingerprint,
    createdAt: new Date().toISOString(),
  };
  writeJson(file, draft);
  return draft;
}

export function listDrafts(profileDir, kind) {
  const dir = draftsDir(profileDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => readJson(path.join(dir, name), null)).filter((draft) => draft && (!kind || draft.kind === kind));
}

export function createManualDraft(profileDir, kind) {
  const allowed = new Set(['skill', 'rule', 'workflow', 'prompt']);
  if (!allowed.has(kind)) return { ok: false, reason: `unknown kind ${kind}` };
  const draft = ensureDraft(profileDir, { fingerprint: `manual|${kind}|${Date.now()}`, kind, subject: `manual ${kind} draft` });
  return { ok: true, draft, activated: false };
}

export function approveDraft(profileDir, draftId) {
  const drafts = listDrafts(profileDir);
  const draft = drafts.find((item) => item.id === draftId);
  if (!draft) return { ok: false, reason: `draft not found: ${draftId}` };
  draft.status = 'approved';
  draft.approvedAt = new Date().toISOString();
  writeJson(path.join(draftsDir(profileDir), `${draft.id}.json`), draft);
  return {
    ok: true,
    draft,
    activated: false,
    message: `Draft ${draft.id} approved. Apply it in BUILD by editing the matching ${draft.kind} file yourself. Active skills and rules were not changed.`,
  };
}

export function queueEvolutionMemory({
  profileDir,
  draft,
  connected = false,
  anonLevel = 0,
  cwd = profileDir,
  date = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!draft) return { ok: false, reason: 'no draft', queued: 0 };
  if (!connected || anonLevel > 0) return { ok: true, queued: 0, skipped: true };
  const fact = prepareWrite({
    content: `Repeated lesson: ${draft.subject}`,
    task: `evolve-${draft.id}`,
    agent: 'pi-1c-harness',
    date,
    cwd,
    target: 'memory',
  });
  const report = prepareWrite({
    content: `Evolution rationale for ${draft.kind} draft ${draft.id}: ${draft.subject}`,
    task: `evolve-${draft.id}`,
    agent: 'pi-1c-harness',
    date,
    cwd,
    target: 'knowledge',
  });
  if (!fact.ok || !report.ok) return { ok: true, queued: 0, skipped: true, reason: fact.reason || report.reason };
  queuePendingRecord(profileDir, { ...fact.record, status: 'queued' });
  queuePendingRecord(profileDir, { ...report.record, status: 'queued' });
  return { ok: true, queued: 2, skipped: false };
}
