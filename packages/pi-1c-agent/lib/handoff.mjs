export const HANDOFF_HEADING = '## Upstream Handoff';
export const HANDOFF_V2_HEADING = '## Handoff v2';
export const HANDOFF_FIELDS = [
  'task', 'artifacts', 'findings', 'locked_decisions',
  'constraints', 'unresolved', 'verification',
];
export const HANDOFF_STATUSES = new Set(['ok', 'error', 'cancelled', 'blocked']);

export function handoffInstruction() {
  return `\n\n# Mandatory 1C handoff\nEnd your final response with this exact section and valid JSON:\n\n${HANDOFF_HEADING}\n\n\`\`\`json\n{\n  "schema": 2,\n  "runId": "uuid",\n  "agent": "1c-developer",\n  "status": "ok",\n  "task": "short task description",\n  "artifacts": [],\n  "findings": [],\n  "locked_decisions": [],\n  "constraints": [],\n  "unresolved": [],\n  "verification": []\n}\n\`\`\`\n\nRules: schema must equal 2; include runId, agent, and status; verification items are objects with kind, status, and summary; do not invent verification; preserve locked decisions; list unresolved work explicitly. Unlabeled v1 envelopes are rejected.`;
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

export function validateHandoff(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['handoff must be an object'] };
  if (value.schema !== 2) errors.push('schema must equal 2');
  if (typeof value.runId !== 'string' || !value.runId.trim()) errors.push('runId must be a string');
  if (typeof value.agent !== 'string' || !value.agent.trim()) errors.push('agent must be a string');
  if (!HANDOFF_STATUSES.has(value.status)) errors.push('status must be ok|error|cancelled|blocked');
  if (typeof value.task !== 'string' || !value.task.trim()) errors.push('task must be a non-empty string');
  for (const key of HANDOFF_FIELDS.filter((x) => x !== 'task' && x !== 'verification')) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be an array`);
  }
  errors.push(...validateVerification(value.verification));
  return { ok: errors.length === 0, errors };
}

function parseFencedJson(tail) {
  const fenced = String(tail ?? '').match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) return { ok: false, errors: ['missing fenced json handoff'] };
  let value;
  try { value = JSON.parse(fenced[1]); } catch (error) { return { ok: false, errors: [`invalid handoff JSON: ${error.message}`] }; }
  const valid = validateHandoff(value);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  return { ok: true, handoff: value };
}

function headingsIn(output) {
  const text = String(output ?? '');
  const found = [];
  for (const heading of [HANDOFF_V2_HEADING, HANDOFF_HEADING]) {
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(heading, from);
      if (idx < 0) break;
      found.push({ heading, idx });
      from = idx + heading.length;
    }
  }
  found.sort((a, b) => a.idx - b.idx);
  return found;
}

export function parseUpstreamHandoff(output) {
  if (typeof output !== 'string') return { ok: false, errors: ['output is not text'] };
  const hits = headingsIn(output);
  if (hits.length === 0) return { ok: false, errors: [`missing '${HANDOFF_HEADING}' section`] };
  let lastValid = null;
  let lastErrors = ['missing fenced json handoff'];
  for (const hit of hits) {
    const tail = output.slice(hit.idx + hit.heading.length);
    const parsed = parseFencedJson(tail);
    if (!parsed.ok) {
      lastErrors = parsed.errors;
      continue;
    }
    const heading = HANDOFF_HEADING;
    const section = `${heading}\n\n\`\`\`json\n${JSON.stringify(parsed.handoff, null, 2)}\n\`\`\``;
    lastValid = { ok: true, handoff: parsed.handoff, section };
  }
  return lastValid || { ok: false, errors: lastErrors };
}
