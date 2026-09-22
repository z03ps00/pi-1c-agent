export const HANDOFF_HEADING = '## Upstream Handoff';
export const HANDOFF_V2_HEADING = '## Handoff v2';
export const HANDOFF_FIELDS = [
  'task', 'artifacts', 'findings', 'locked_decisions',
  'constraints', 'unresolved', 'verification',
];
export const HANDOFF_STATUSES = new Set(['ok', 'error', 'cancelled', 'blocked']);
const HEADING_RE = /#{1,3}[ \t]*(?:upstream[ \t]+)?handoff(?:[ \t]*v2)?\b/gi;
const FENCE_RE = /```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/gi;

function safeAgentName(name) {
  const raw = String(name || '').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(raw) ? raw : '1c-developer';
}

export function handoffInstruction(agentName = '1c-developer') {
  const agent = safeAgentName(agentName);
  return `\n\n# Mandatory 1C handoff (required)\nYour reply is rejected unless it ends with this exact heading and a schema-2 JSON fence. Required for every task, including demos and quick lookups. Do not omit it. Do not replace it with a prose-only report.\n\n${HANDOFF_HEADING}\n\n\`\`\`json\n{\n  "schema": 2,\n  "runId": "uuid",\n  "agent": "${agent}",\n  "status": "ok",\n  "task": "short task description",\n  "artifacts": [],\n  "findings": [],\n  "locked_decisions": [],\n  "constraints": [],\n  "unresolved": [],\n  "verification": []\n}\n\`\`\`\n\nRules: schema must equal 2 (number, not omitted); include runId, agent, and status; verification items are objects with kind, status, and summary; do not invent verification; preserve locked decisions; list unresolved work explicitly. Unlabeled v1 envelopes are rejected.`;
}

function validateVerification(value) {
  if (!Array.isArray(value)) return ['verification must be an array'];
  const errors = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`verification[${index}] must be an object with kind, status, and summary`);
      return;
    }
    if (typeof entry.kind !== 'string' || !entry.kind.trim()) errors.push(`verification[${index}].kind must be a non-empty string`);
    if (typeof entry.status !== 'string' || !entry.status.trim()) errors.push(`verification[${index}].status must be a non-empty string`);
    if (typeof entry.summary !== 'string' || !entry.summary.trim()) errors.push(`verification[${index}].summary must be a non-empty string`);
  });
  return errors;
}

function coerceHandoffValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (value.schema === '2' || value.schema === 2) return { ...value, schema: 2 };
  return value;
}

export function validateHandoff(value) {
  const errors = [];
  const handoff = coerceHandoffValue(value);
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) return { ok: false, errors: ['handoff must be an object'] };
  if (handoff.schema !== 2) errors.push('schema must equal 2');
  if (typeof handoff.runId !== 'string' || !handoff.runId.trim()) errors.push('runId must be a string');
  if (typeof handoff.agent !== 'string' || !handoff.agent.trim()) errors.push('agent must be a string');
  if (!HANDOFF_STATUSES.has(handoff.status)) errors.push('status must be ok|error|cancelled|blocked');
  if (typeof handoff.task !== 'string' || !handoff.task.trim()) errors.push('task must be a non-empty string');
  for (const key of HANDOFF_FIELDS.filter((x) => x !== 'task' && x !== 'verification')) {
    if (!Array.isArray(handoff[key])) errors.push(`${key} must be an array`);
  }
  errors.push(...validateVerification(handoff.verification));
  return { ok: errors.length === 0, errors, handoff };
}

function parseJsonCandidate(raw) {
  let value;
  try { value = JSON.parse(raw); } catch (error) { return { ok: false, errors: [`invalid handoff JSON: ${error.message}`] }; }
  const valid = validateHandoff(value);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  return { ok: true, handoff: valid.handoff };
}

function parseFencedJson(tail) {
  const text = String(tail ?? '');
  const fenced = text.match(/```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/i);
  if (fenced) return parseJsonCandidate(fenced[1]);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = parseJsonCandidate(text.slice(start, end + 1));
    if (parsed.ok) return parsed;
  }
  return { ok: false, errors: ['missing fenced json handoff'] };
}

function headingsIn(output) {
  const text = String(output ?? '');
  const found = [];
  const re = new RegExp(HEADING_RE.source, HEADING_RE.flags);
  let match;
  while ((match = re.exec(text))) {
    found.push({ heading: match[0], idx: match.index });
  }
  return found;
}

function wrapHandoff(handoff) {
  return {
    ok: true,
    handoff,
    section: `${HANDOFF_HEADING}\n\n\`\`\`json\n${JSON.stringify(handoff, null, 2)}\n\`\`\``,
  };
}

function lastValidFence(output) {
  const text = String(output ?? '');
  let lastValid = null;
  const re = new RegExp(FENCE_RE.source, FENCE_RE.flags);
  let match;
  while ((match = re.exec(text))) {
    const parsed = parseJsonCandidate(match[1]);
    if (parsed.ok) lastValid = wrapHandoff(parsed.handoff);
  }
  return lastValid;
}

export function parseUpstreamHandoff(output) {
  if (typeof output !== 'string') return { ok: false, errors: ['output is not text'] };
  const hits = headingsIn(output);
  let lastValid = null;
  let lastErrors = hits.length === 0
    ? [`missing '${HANDOFF_HEADING}' section`]
    : ['missing fenced json handoff'];
  for (const hit of hits) {
    const parsed = parseFencedJson(output.slice(hit.idx + hit.heading.length));
    if (!parsed.ok) {
      lastErrors = parsed.errors;
      continue;
    }
    lastValid = wrapHandoff(parsed.handoff);
  }
  if (lastValid) return lastValid;
  const recovered = lastValidFence(output);
  if (recovered) return recovered;
  return { ok: false, errors: lastErrors };
}

export function handoffFailureMessage(agentName, parsed, output, extras = {}) {
  const errors = Array.isArray(parsed?.errors) ? parsed.errors.join('; ') : 'invalid handoff';
  const snippet = String(output || '').trim().slice(-800);
  const lines = [`subagent ${agentName} returned invalid handoff: ${errors}`];
  if (extras.lastStopReason) lines.push(`stopReason: ${extras.lastStopReason}`);
  if (extras.lastErrorMessage) lines.push(`provider: ${extras.lastErrorMessage}`);
  if (Array.isArray(extras.eventTypes) && extras.eventTypes.length) {
    lines.push(`events: ${extras.eventTypes.join(' → ')}`);
  }
  if (extras.stdoutBytes != null || extras.stderrBytes != null) {
    lines.push(`bytes: stdout=${extras.stdoutBytes ?? 0} stderr=${extras.stderrBytes ?? 0}`);
  }
  if (snippet) lines.push('', 'Child output (tail):', snippet);
  else lines.push('', 'Child assistant text was empty.');
  const stderr = String(extras.stderr || '').trim().slice(-1500);
  if (stderr) lines.push('', 'Child stderr (tail):', stderr);
  const stdoutTail = String(extras.stdoutTail || '').trim().slice(-1500);
  if (!snippet && stdoutTail) lines.push('', 'Child stdout (tail):', stdoutTail);
  return lines.join('\n');
}
