import { hasUnredactableSecret, loadExactSecretValues, redact } from './redact.mjs';
import { buildIdempotencyKey, contentHash, mintCorrelationId } from './memory-key.mjs';
import { deriveProjectId, slugProjectId } from './project-id.mjs';

export const VERIFY_RETRY = Object.freeze({
  attempts: 4,
  delaysMs: Object.freeze([500, 1500, 4000]),
});

export const MEMORY_VERIFY_RETRY = Object.freeze({
  attempts: 4,
  delaysMs: Object.freeze([2000, 6000, 12000]),
});

export function halfConfirmed(half) {
  return Boolean(half?.recorded) || half?.status === 'duplicate';
}

export function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Number(ms) || 0));
}

export function safeUriSegment(value) {
  return slugProjectId(value);
}

export function sessionCaptureDocumentUri(projectId, sessionId) {
  return `viking://resources/session-captures/${safeUriSegment(projectId)}/${safeUriSegment(sessionId)}.md`;
}

export async function recallWithRetry(recall, record, {
  attempts = VERIFY_RETRY.attempts,
  delaysMs = VERIFY_RETRY.delaysMs,
  sleep = defaultSleep,
} = {}) {
  const n = Math.max(1, Number(attempts) || 1);
  for (let i = 0; i < n; i += 1) {
    try {
      if (typeof recall === 'function' && await recall(record)) return true;
    } catch {
      // retry
    }
    if (i < n - 1) await sleep(delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 0);
  }
  return false;
}

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
  uri,
  sessionId,
} = {}) {
  const exactValues = loadExactSecretValues({ cwd });
  const redacted = redact(content, { exactValues });
  if (hasUnredactableSecret(redacted.text)) {
    return { ok: false, reason: 'unredactable secret blocks the write' };
  }
  const hash = contentHash(redacted.text);
  const idempotency_key = buildIdempotencyKey({ task, agent, date, contentHash: hash });
  const projectId = deriveProjectId({ cwd, basename: scope });
  const stored = redacted.text.includes(idempotency_key)
    ? redacted.text
    : `idempotency_key: ${idempotency_key}\n\n${redacted.text}`;
  const documentUri = target === 'knowledge'
    ? (uri || (sessionId ? sessionCaptureDocumentUri(projectId, sessionId) : ''))
    : '';
  return {
    ok: true,
    record: {
      idempotency_key,
      content_hash: hash,
      content: stored,
      kinds: redacted.kinds,
      target,
      scope: `project:${projectId}`,
      correlation_id: correlationId || mintCorrelationId(),
      status: 'pending',
      task: String(task ?? '').trim() || 'unknown',
      agent: String(agent ?? '').trim() || 'unknown',
      date: String(date ?? '').trim() || new Date().toISOString().slice(0, 10),
      uri: documentUri || undefined,
      session_id: sessionId || undefined,
    },
  };
}

export async function writeWithVerify({
  record,
  existsByKey,
  remember,
  recall,
  queuePending,
  sleep,
  verify,
} = {}) {
  if (!record) return { status: 'blocked', recorded: false, reason: 'no record' };
  if (typeof existsByKey === 'function') {
    const existing = await existsByKey(record);
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
  // Cognee recall often drops the exact idempotency_key after cognify.
  // HTTP-ok remember is enough; do not block the pair on CHUNKS read-back.
  if (record.target === 'memory') {
    return { status: 'recorded', recorded: true, correlation_id: record.correlation_id };
  }
  const found = await recallWithRetry(recall, record, {
    attempts: verify?.attempts ?? VERIFY_RETRY.attempts,
    delaysMs: verify?.delaysMs ?? VERIFY_RETRY.delaysMs,
    sleep: typeof sleep === 'function' ? sleep : defaultSleep,
  });
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
  sessionId,
  uri,
  correlationId,
  existsByKey,
  remember,
  recall,
  queuePending,
  sleep,
  verify,
} = {}) {
  const correlation_id = correlationId || mintCorrelationId();
  const factPrep = prepareWrite({
    content: fact,
    task,
    agent,
    date,
    cwd,
    target: 'memory',
    correlationId: correlation_id,
    sessionId,
  });
  const reportPrep = prepareWrite({
    content: report,
    task,
    agent,
    date,
    cwd,
    target: 'knowledge',
    correlationId: correlation_id,
    sessionId,
    uri,
  });
  if (!factPrep.ok || !reportPrep.ok) {
    return { ok: false, reason: factPrep.reason || reportPrep.reason };
  }
  const adapters = { existsByKey, remember, recall, queuePending, sleep, verify };
  const factResult = await writeWithVerify({ record: factPrep.record, ...adapters });
  const reportResult = await writeWithVerify({ record: reportPrep.record, ...adapters });
  return {
    ok: factResult.recorded || reportResult.recorded || factResult.status === 'duplicate',
    correlation_id,
    fact: factResult,
    report: reportResult,
    factRecord: factPrep.record,
    reportRecord: reportPrep.record,
  };
}
