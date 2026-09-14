const UNSOLICITED_MCP_NAMES = new Set(['memory', 'knowledge', 'cognee-memory']);
const UNSOLICITED_PORT_RE = /(?:127\.0\.0\.1|localhost):800[2-8]\b/;
export const OPTIONAL_FRAGMENT_FILES = [
  'memory.json',
  'knowledge.json',
  '1c-bundle.json',
  'vanessa.json',
];

export function findUnsolicitedMcpServers(mcp) {
  const issues = [];
  if (!mcp || typeof mcp !== 'object') return issues;
  const servers = mcp.mcpServers && typeof mcp.mcpServers === 'object' ? mcp.mcpServers : {};
  for (const [name, spec] of Object.entries(servers)) {
    const key = String(name);
    if (UNSOLICITED_MCP_NAMES.has(key) || /cognee/i.test(key)) issues.push(key);
    if (/vanessa/i.test(key)) issues.push(`${key}:vanessa-in-default`);
    const blob = JSON.stringify(spec ?? {});
    if (UNSOLICITED_PORT_RE.test(blob) || /:800[2-8]\b/.test(blob)) {
      issues.push(`${key}:1c-bundle-port`);
    }
  }
  return [...new Set(issues)];
}

/**
 * Inspect a parsed mcp.json object.
 * `unsolicited` lists memory/knowledge/1C-bundle (8002–8008) and Vanessa-in-default hits.
 */
export function inspectMcpJson(obj) {
  const unsolicited = findUnsolicitedMcpServers(obj);
  return { unsolicited, optionalOnly: unsolicited.length === 0 };
}

/**
 * True when optional families live only as mcp.optional fragments
 * and the default mcp.json registers none of them.
 */
export function optionalFragmentsOnly({ fragmentNames = [], defaultMcp = {} } = {}) {
  const hasFragments = OPTIONAL_FRAGMENT_FILES.every((n) => fragmentNames.includes(n));
  const inspected = inspectMcpJson(defaultMcp);
  return hasFragments && inspected.optionalOnly;
}
