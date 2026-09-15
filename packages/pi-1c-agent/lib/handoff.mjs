export const HANDOFF_HEADING = '## Upstream Handoff';
export const HANDOFF_FIELDS = [
  'task', 'artifacts', 'findings', 'public_surface', 'locked_decisions',
  'constraints', 'unresolved', 'verification',
];

export function handoffInstruction() {
  return `\n\n# Mandatory 1C handoff\nEnd your final response with this exact section and valid JSON:\n\n${HANDOFF_HEADING}\n\n\`\`\`json\n{\n  "task": "short task description",\n  "artifacts": [],\n  "findings": [],\n  "public_surface": [],\n  "locked_decisions": [],\n  "constraints": [],\n  "unresolved": [],\n  "verification": []\n}\n\`\`\`\n\nRules: do not invent verification; preserve locked decisions; list unresolved work explicitly.`;
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

export function parseUpstreamHandoff(output) {
  if (typeof output !== 'string') return { ok: false, errors: ['output is not text'] };
  const idx = output.lastIndexOf(HANDOFF_HEADING);
  if (idx < 0) return { ok: false, errors: [`missing '${HANDOFF_HEADING}' section`] };
  const tail = output.slice(idx + HANDOFF_HEADING.length);
  const fenced = tail.match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) return { ok: false, errors: ['missing fenced json handoff'] };
  let value;
  try { value = JSON.parse(fenced[1]); } catch (error) { return { ok: false, errors: [`invalid handoff JSON: ${error.message}`] }; }
  const valid = validateHandoff(value);
  if (!valid.ok) return { ok: false, errors: valid.errors };
  const section = `${HANDOFF_HEADING}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  return { ok: true, handoff: value, section };
}
