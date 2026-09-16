import { redact } from './redact.mjs';
import { buildIdempotencyKey, contentHash, mintCorrelationId } from './memory-key.mjs';
import { halfConfirmed, prepareWrite, writePaired } from './memory-write.mjs';
import { queuePendingRecord } from './memory-reconcile.mjs';

export { distillWithProvider, parseDistillPayload } from './distill-provider.mjs';

export const CAPTURE_STATE_TYPE = 'pi-1c-session-capture-state';
export const DISTILLER_MODES = Object.freeze(['off', 'stack', 'ollama', 'routerai', 'chat']);

export function defaultCaptureState() {
  return {
    idleEnabled: true,
    archiveTranscript: false,
    distiller: { mode: 'stack', model: '' },
  };
}

export function normalizeCaptureState(raw) {
  const base = defaultCaptureState();
  if (!raw || typeof raw !== 'object') return base;
  const mode = DISTILLER_MODES.includes(raw.distiller?.mode) ? raw.distiller.mode : (DISTILLER_MODES.includes(raw.mode) ? raw.mode : base.distiller.mode);
  const model = String(raw.distiller?.model ?? raw.model ?? '').trim();
  return {
    idleEnabled: raw.idleEnabled !== false,
    archiveTranscript: raw.archiveTranscript === true,
    distiller: { mode, model },
  };
}

export function restoreCaptureState(entries) {
  if (!Array.isArray(entries)) return defaultCaptureState();
  const hits = entries.filter((e) => e && e.type === 'custom' && e.customType === CAPTURE_STATE_TYPE);
  const last = hits[hits.length - 1];
  return normalizeCaptureState(last?.data?.state ?? last?.data);
}

export function parseWrapArgs(args) {
  const raw = String(args ?? '').trim();
  if (!raw || raw === 'now') return { action: 'capture' };
  if (raw === 'status') return { action: 'status' };
  if (raw === 'archive') return { action: 'capture', archive: true };
  const auto = raw.match(/^auto\s+(on|off|status)$/i);
  if (auto) return { action: 'auto', value: auto[1].toLowerCase() };
  if (raw === 'auto') return { action: 'auto', value: 'status' };
  return { action: 'unknown', raw };
}

export function parseCaptureModelArgs(args) {
  const raw = String(args ?? '').trim();
  if (!raw || raw === 'status') return { action: 'status' };
  if (raw === 'off') return { action: 'set', mode: 'off', model: '' };
  if (raw === 'stack') return { action: 'set', mode: 'stack', model: '' };
  if (raw === 'chat') return { action: 'set', mode: 'chat', model: '' };
  const named = raw.match(/^(ollama|routerai)\s+(\S+)$/i);
  if (named) return { action: 'set', mode: named[1].toLowerCase(), model: named[2] };
  if (/^(ollama|routerai)$/i.test(raw)) return { action: 'invalid', error: `${raw} requires a model name` };
  return { action: 'invalid', error: `Unknown capture-model argument: ${raw}. Use status | off | stack | ollama <model> | routerai <model> | chat` };
}

export function applyCaptureModel(state, parsed) {
  const current = normalizeCaptureState(state);
  if (parsed.action === 'status') return { ok: true, state: current, changed: false };
  if (parsed.action === 'set') {
    const next = normalizeCaptureState({
      ...current,
      distiller: { mode: parsed.mode, model: parsed.model || '' },
    });
    return { ok: true, state: next, changed: JSON.stringify(next.distiller) !== JSON.stringify(current.distiller) };
  }
  return { ok: false, state: current, error: parsed.error || 'invalid capture-model argument' };
}

export function applyIdleToggle(state, value) {
  const current = normalizeCaptureState(state);
  if (value === 'status') return { ok: true, state: current, changed: false };
  if (value === 'on') return { ok: true, state: { ...current, idleEnabled: true }, changed: !current.idleEnabled };
  if (value === 'off') return { ok: true, state: { ...current, idleEnabled: false }, changed: current.idleEnabled };
  return { ok: false, state: current, error: 'use /wrap auto on|off|status' };
}

export function captureModelStatus(state) {
  const s = normalizeCaptureState(state);
  const model = s.distiller.model ? ` ${s.distiller.model}` : '';
  return `capture-model: ${s.distiller.mode}${model}`;
}

export function footerCaptureLabel(state, host = 'pi') {
  const s = normalizeCaptureState(state);
  if (host !== 'pi') return 'capture:manual';
  return s.idleEnabled ? `capture:on/${s.distiller.mode}` : `capture:off/${s.distiller.mode}`;
}

/** Pi event ctx has getContextUsage but not newSession (command-only). */
export function detectCaptureHost(ctx) {
  if (!ctx || typeof ctx !== 'object') return 'cursor';
  if (typeof ctx.getContextUsage === 'function' || typeof ctx.newSession === 'function') return 'pi';
  return 'cursor';
}

/**
 * Unwrap Pi SessionEntry envelopes so distillHeuristic sees tool/input/content.
 * Already-flat test rows pass through unchanged.
 */
export function flattenSessionEntries(entries) {
  const out = [];
  for (const raw of Array.isArray(entries) ? entries : []) {
    if (!raw || typeof raw !== 'object') continue;
    const inner = raw.message && typeof raw.message === 'object' && !Array.isArray(raw.message)
      ? raw.message
      : raw;
    const contentParts = Array.isArray(inner.content) ? inner.content : [];
    const textFromParts = contentParts
      .filter((x) => x && x.type === 'text')
      .map((x) => String(x.text ?? ''))
      .filter(Boolean)
      .join('\n');
    const content = typeof inner.content === 'string'
      ? inner.content
      : (textFromParts || (typeof raw.content === 'string' ? raw.content : '') || String(inner.text || raw.text || ''));
    const tool = inner.toolName || inner.name || inner.tool || raw.toolName || raw.name || raw.tool || '';
    const input = inner.input || inner.args || inner.arguments || raw.input || raw.args || {};
    out.push({
      type: raw.type || inner.type || inner.role,
      role: inner.role || raw.role || raw.type,
      tool,
      input,
      content,
    });
    for (const part of contentParts) {
      if (!part || part.type !== 'toolCall') continue;
      out.push({
        type: 'toolCall',
        role: inner.role || raw.role || 'assistant',
        tool: part.name || part.toolName || part.tool || '',
        input: part.arguments || part.args || part.input || {},
        content: '',
      });
    }
  }
  return out;
}

export function emptyDistill() {
  return {
    task: '',
    artifacts: [],
    findings: [],
    public_surface: [],
    locked_decisions: [],
    constraints: [],
    unresolved: [],
    verification: [],
    tools: [],
    files: [],
    fallback: false,
  };
}

export function isSubstantial(distilled) {
  if (!distilled) return false;
  // Durable signals only. `tools` alone (e.g. a read-only Q&A) is NOT substantial.
  const durable = ['files', 'locked_decisions', 'verification', 'unresolved', 'findings', 'public_surface', 'constraints', 'artifacts'];
  return durable.some((key) => Array.isArray(distilled[key]) && distilled[key].length > 0);
}

function pushUnique(list, value) {
  const item = String(value ?? '').trim();
  if (!item || list.includes(item)) return;
  list.push(item);
}

export function distillHeuristic(entries = []) {
  const distilled = emptyDistill();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const type = entry?.type || entry?.role || '';
    const tool = entry?.tool || entry?.name || entry?.toolName || '';
    const input = entry?.input || entry?.args || {};
    if (tool) pushUnique(distilled.tools, tool);
    const filePath = input.path || input.file || input.target;
    if (filePath && /write|edit|delete/.test(String(tool))) pushUnique(distilled.files, filePath);
    const text = String(entry?.content || entry?.text || entry?.message || '');
    if (!text) continue;
    if (!distilled.task && (type === 'user' || entry?.role === 'user')) {
      distilled.task = text.split(/\r?\n/, 1)[0].slice(0, 200);
    }
    for (const line of text.split(/\r?\n/)) {
      if (/decision:/i.test(line)) pushUnique(distilled.locked_decisions, line.replace(/^.*decision:\s*/i, '').trim());
      if (/next steps?:/i.test(line)) pushUnique(distilled.unresolved, line.replace(/^.*next steps?:\s*/i, '').trim());
      if (/verification:/i.test(line)) pushUnique(distilled.verification, line.replace(/^.*verification:\s*/i, '').trim());
    }
  }
  distilled.artifacts = [...distilled.files];
  return distilled;
}

export function formatFact(distilled, extras = {}) {
  const d = distilled || emptyDistill();
  const lines = [
    `TYPE: session_capture`,
    extras.correlation_id ? `CORRELATION_ID: ${extras.correlation_id}` : '',
    extras.fallback ? 'DISTILLER: heuristic-fallback' : `DISTILLER: ${extras.distiller || 'heuristic'}`,
    `SUBJECT: ${d.task || 'session'}`,
    `DECISIONS: ${(d.locked_decisions || []).join('; ') || 'none'}`,
    `FILES: ${(d.files || []).join(', ') || 'none'}`,
    `UNRESOLVED: ${(d.unresolved || []).join('; ') || 'none'}`,
  ];
  return redact(lines.filter(Boolean).join('\n')).text;
}

export function formatReport(distilled, extras = {}) {
  const d = distilled || emptyDistill();
  const payload = {
    task: d.task || '',
    artifacts: d.artifacts || [],
    findings: d.findings || [],
    public_surface: d.public_surface || [],
    locked_decisions: d.locked_decisions || [],
    constraints: d.constraints || [],
    unresolved: d.unresolved || [],
    verification: d.verification || [],
    tools: d.tools || [],
    files: d.files || [],
    correlation_id: extras.correlation_id || '',
    distiller: extras.fallback ? 'heuristic-fallback' : (extras.distiller || 'heuristic'),
  };
  return redact(`## Session capture\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``).text;
}

export function sessionIdempotencyKey({ sessionId, distilled, agent, date }) {
  const hash = contentHash(formatReport(distilled));
  return buildIdempotencyKey({
    task: `session-${sessionId || 'unknown'}`,
    agent: agent || 'pi-1c-agent',
    date,
    contentHash: hash,
  });
}

export function shouldIdleCapture({
  host = 'pi',
  idleEnabled = true,
  mode = 'build',
  anonLevel = 0,
  substantial = false,
} = {}) {
  if (host !== 'pi') return false;
  if (!idleEnabled) return false;
  if (mode === 'ask' || mode === 'plan') return false;
  if ((Number(anonLevel) || 0) >= 1) return false;
  return Boolean(substantial);
}

export async function runDistiller({
  mode = 'off',
  entries,
  distillWithProvider,
  distillWithChat,
} = {}) {
  if (mode === 'off') return { distilled: distillHeuristic(entries), fallback: false, used: 'heuristic' };
  try {
    if (mode === 'chat' && typeof distillWithChat === 'function') {
      const distilled = await distillWithChat(entries);
      if (distilled) return { distilled, fallback: false, used: 'chat' };
    } else if (mode !== 'chat' && typeof distillWithProvider === 'function') {
      const distilled = await distillWithProvider({ mode, entries });
      if (distilled) return { distilled, fallback: false, used: mode };
    }
  } catch {
    // fall through to heuristic
  }
  return { distilled: distillHeuristic(entries), fallback: mode !== 'off', used: 'heuristic-fallback' };
}

export async function captureSession({
  entries,
  sessionId,
  cwd,
  agent = 'pi-1c-agent',
  date,
  mode = 'build',
  anonLevel = 0,
  archiveTranscript = false,
  distillerMode = 'off',
  distillWithProvider,
  distillWithChat,
  existsByKey,
  remember,
  recall,
  profileDir,
  correlationId,
  rawTranscript,
  sleep,
  verify,
} = {}) {
  if ((Number(anonLevel) || 0) >= 1) {
    return { status: 'skipped', reason: 'anonymous', memory: 'Memory: skipped — anonymous', wrotePending: false };
  }
  if (mode === 'ask' || mode === 'plan') {
    return { status: 'skipped', reason: 'read-only mode', wrotePending: false };
  }

  let used;
  let distilled;
  let fallback = false;
  try {
    const result = await runDistiller({
      mode: distillerMode,
      entries,
      distillWithProvider,
      distillWithChat,
    });
    distilled = result.distilled;
    fallback = result.fallback;
    used = result.used;
  } catch {
    try {
      distilled = distillHeuristic(entries);
      fallback = true;
      used = 'heuristic-fallback';
    } catch (error) {
      const correlation_id = correlationId || mintCorrelationId();
      const pending = prepareWrite({
        content: `UNCONFIRMED session capture ${sessionId || ''} (${error.message})`,
        task: `session-${sessionId || 'unknown'}`,
        agent,
        date,
        cwd,
        target: 'memory',
        correlationId: correlation_id,
      });
      if (pending.ok && profileDir) queuePendingRecord(profileDir, pending.record);
      return { status: 'UNCONFIRMED', reason: 'distill failed', wrotePending: Boolean(pending.ok), correlation_id };
    }
  }

  if (!isSubstantial(distilled)) {
    return { status: 'skipped', reason: 'nothing durable to save', wrotePending: false };
  }

  const correlation_id = correlationId || mintCorrelationId();
  const fact = formatFact(distilled, { correlation_id, fallback, distiller: used });
  const report = formatReport(distilled, { correlation_id, fallback, distiller: used });
  const paired = await writePaired({
    fact,
    report,
    task: `session-${sessionId || 'unknown'}`,
    agent,
    date,
    cwd,
    sessionId,
    correlationId: correlation_id,
    existsByKey,
    remember,
    recall,
    queuePending: profileDir ? (record) => queuePendingRecord(profileDir, record) : undefined,
    sleep,
    verify,
  });

  let archived = false;
  if (archiveTranscript && rawTranscript) {
    const archivedText = redact(`KIND: raw-transcript-document\nCORRELATION_ID: ${correlation_id}\n\n${rawTranscript}`).text;
    if (typeof remember === 'function') {
      const prep = prepareWrite({
        content: archivedText,
        task: `session-transcript-${sessionId || 'unknown'}`,
        agent,
        date,
        cwd,
        target: 'knowledge',
        correlationId: correlation_id,
        sessionId: `${sessionId || 'unknown'}-transcript`,
      });
      if (prep.ok) {
        await remember({ ...prep.record, kind: 'raw-transcript-document' });
        archived = true;
      }
    }
  }

  const recorded = halfConfirmed(paired.fact) && halfConfirmed(paired.report);
  return {
    status: recorded ? 'recorded' : 'UNCONFIRMED',
    correlation_id: paired.correlation_id || correlation_id,
    fallback,
    archived,
    distilled,
    fact: paired.fact,
    report: paired.report,
    wrotePending: paired.fact?.status === 'UNCONFIRMED' || paired.report?.status === 'UNCONFIRMED',
  };
}

export function formatWrapNotify(result) {
  const id = result?.correlation_id || '';
  if (result?.status === 'skipped') {
    return result.reason === 'anonymous' ? 'Memory: skipped — anonymous' : `wrap: ${result.reason || 'skipped'}`;
  }
  if (result?.status === 'recorded') return `wrap: recorded (${id})`;
  const factOk = halfConfirmed(result?.fact);
  const reportOk = halfConfirmed(result?.report);
  if (reportOk && !factOk) return `wrap: report recorded, fact pending (${id})`;
  if (factOk && !reportOk) return `wrap: fact recorded, report pending (${id})`;
  return `wrap: UNCONFIRMED (${id})`;
}

export function captureDoesNotTouchMainChat() {
  return { injectsIntoMainChat: false, growsMainContext: false, awaitedByMainTurn: false };
}
