export const HANDOFF_HEADING = '## Upstream Handoff';
export const HANDOFF_V2_HEADING = '## Handoff v2';
export const HANDOFF_FIELDS = [
  'task', 'artifacts', 'findings', 'public_surface', 'locked_decisions',
  'constraints', 'unresolved', 'verification',
];

export function handoffInstruction() {
  return `\n\n# Mandatory 1C handoff\nEnd your final response with this exact section and valid JSON:\n\n${HANDOFF_HEADING}\n\n\`\`\`json\n{\n  "schema": 2,\n  "task": "short task description",\n  "artifacts": [],\n  "findings": [],\n  "public_surface": [],\n  "locked_decisions": [],\n  "constraints": [],\n  "unresolved": [],\n  "verification": []\n}\n\`\`\`\n\nRules: do not invent verification; preserve locked decisions; list unresolved work explicitly.`;
}

export function validateHandoff(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['handoff must be an object'] };
  if (typeof value.task !== 'string' || !value.task.trim()) errors.push('task must be a non-empty string');
  for (const key of HANDOFF_FIELDS.filter((x) => x !== 'task')) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be an array`);
  }
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
