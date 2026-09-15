import { hasUnredactableSecret, redact } from './redact.mjs';
import { buildIdempotencyKey, contentHash, mintCorrelationId } from './memory-key.mjs';
import { deriveProjectId } from './project-id.mjs';

export function formatMemoryStatus({ recalled = 0, saved = 0, unconfirmed = 0, anonymous = false, nothingToSave = false } = {}) {
  if (anonymous) return 'Memory: skipped — anonymous';
  const recallPart = recalled > 0 ? `recalled ${recalled}` : 'nothing relevant';
  let savePart = 'nothing to save';
  if (unconfirmed > 0) savePart = 'UNCONFIRMED';
  else if (saved > 0) savePart = `saved ${saved}`;
  else if (nothingToSave) savePart = 'nothing to save';
  return `Memory: ${recallPart}; ${savePart}`;
}

export function prepareWrite({
  content,
  task,
  agent,
  date,
  scope,
  cwd,
  target = 'memory',
  correlationId,
} = {}) {
  const redacted = redact(content);
  if (hasUnredactableSecret(redacted.text)) {
    return { ok: false, reason: 'unredactable secret blocks the write' };
  }
  const hash = contentHash(redacted.text);
  const idempotency_key = buildIdempotencyKey({ task, agent, date, contentHash: hash });
  const projectId = deriveProjectId({ cwd, basename: scope });
  return {
    ok: true,
    record: {
      idempotency_key,
      content_hash: hash,
      content: redacted.text,
      kinds: redacted.kinds,
      target,
      scope: `project:${projectId}`,
      correlation_id: correlationId || mintCorrelationId(),
      status: 'pending',
      task: String(task ?? '').trim() || 'unknown',
      agent: String(agent ?? '').trim() || 'unknown',
      date: String(date ?? '').trim() || new Date().toISOString().slice(0, 10),
    },
  };
}

export async function writeWithVerify({
  record,
  existsByKey,
  remember,
  recall,
  queuePending,
} = {}) {
  if (!record) return { status: 'blocked', recorded: false, reason: 'no record' };
  if (typeof existsByKey === 'function') {
    const existing = await existsByKey(record.idempotency_key);
    if (existing) return { status: 'duplicate', recorded: false, existing: true };
  }
  let wrote = { ok: false };
  try {
    wrote = typeof remember === 'function' ? await remember(record) : { ok: false };
  } catch {
    wrote = { ok: false };
  }
  if (!wrote?.ok) {
    if (typeof queuePending === 'function') queuePending(record);
    return { status: 'UNCONFIRMED', recorded: false };
  }
  let found = false;
  try {
    found = typeof recall === 'function' ? Boolean(await recall(record.idempotency_key)) : false;
  } catch {
    found = false;
  }
  if (!found) {
    if (typeof queuePending === 'function') queuePending(record);
    return { status: 'UNCONFIRMED', recorded: false };
  }
  return { status: 'recorded', recorded: true, correlation_id: record.correlation_id };
}

export async function writePaired({
  fact,
  report,
  task,
  agent,
  date,
  cwd,
  existsByKey,
  remember,
  recall,
  queuePending,
} = {}) {
  const correlation_id = mintCorrelationId();
  const factPrep = prepareWrite({ content: fact, task, agent, date, cwd, target: 'memory', correlationId: correlation_id });
  const reportPrep = prepareWrite({ content: report, task, agent, date, cwd, target: 'knowledge', correlationId: correlation_id });
  if (!factPrep.ok || !reportPrep.ok) {
    return { ok: false, reason: factPrep.reason || reportPrep.reason };
  }
  const adapters = { existsByKey, remember, recall, queuePending };
  const factResult = await writeWithVerify({ record: factPrep.record, ...adapters });
  const reportResult = await writeWithVerify({ record: reportPrep.record, ...adapters });
  return {
    ok: factResult.recorded || reportResult.recorded || factResult.status === 'duplicate',
    correlation_id,
    fact: factResult,
    report: reportResult,
  };
}
