export const HANDOFF_KEYS = [
  'task',
  'artifacts',
  'findings',
  'public_surface',
  'locked_decisions',
  'constraints',
  'unresolved',
  'verification',
];

export const PIPELINE_WRITER_AGENTS = [
  '1c-developer',
  '1c-metadata-manager',
  '1c-refactoring',
  '1c-error-fixer',
  '1c-performance-optimizer',
];

export function hasJsonHandoffBlock(agentMd) {
  if (!agentMd) return false;
  const mentions = /## Upstream Handoff/.test(agentMd);
  const keysOk = HANDOFF_KEYS.every((key) => {
    const re = new RegExp(`(?:\`|"|'|\\b)${key}(?:\`|"|'|\\b)`);
    return re.test(agentMd);
  });
  return mentions && keysOk;
}

/** True when markdown-only handoff is treated as the required contract. */
export function markdownOnlyHandoffRequired(agentMd) {
  if (!agentMd) return false;
  if (!/Handoff for the next subagent/.test(agentMd)) return false;
  return !/is not required/.test(agentMd);
}

export function isWriterToolsLine(agentMd) {
  const m = String(agentMd).match(/^tools:\s*(.+)$/m);
  if (!m) return false;
  return /\b(write|edit|bash)\b/.test(m[1]);
}
