import fs from 'node:fs';
import path from 'node:path';

const DEVOPS_STAIN = 'Devops' + 'Moments';
const UNSOLICITED_MCP_NAMES = new Set(['memory', 'knowledge', 'cognee-memory']);
const UNSOLICITED_PORT_RE = /(?:127\.0\.0\.1|localhost):800[2-8]\b/;

export const PACKAGE_SHIPPED_ROOTS = [
  'README.md',
  'INSTALL.md',
  'package.json',
  'bootstrap',
  'extensions',
  'rules',
  'skills',
  'prompts',
  'config',
  'lib',
  'themes',
];

const SKIP_SCAN_NAMES = new Set(['product-health.mjs', 'docker-policy.mjs']);

export function walkFiles(root, pred = () => true) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  const stat = fs.statSync(root);
  if (stat.isFile()) return pred(root) ? [root] : [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
}

export function isExamplePath(filePath) {
  return /\.example(\.|$)/i.test(path.basename(filePath));
}

export function findMachineLocalPathHits(text) {
  if (!text) return [];
  const hits = [];
  if (text.includes(DEVOPS_STAIN)) hits.push(DEVOPS_STAIN);
  if (/(?:^|[^$\w])(?:[CD]:[\\/]Users[\\/]|[CD]:\\Users\\)/i.test(text)) hits.push('absolute-user-home');
  if (/[CD]:[\\/]1[CСC]_Базы/i.test(text)) hits.push('absolute-ib-root');
  if (/\/home\/[A-Za-z0-9._-]+\//.test(text)) hits.push('absolute-linux-home');
  if (/\/mnt\/vol_\d+/.test(text)) hits.push('volume-mount');
  return hits;
}

export function scanMachineLocalPaths(files, readFile = (p) => fs.readFileSync(p, 'utf8')) {
  const hits = [];
  for (const filePath of files) {
    if (SKIP_SCAN_NAMES.has(path.basename(filePath))) continue;
    if (isExamplePath(filePath)) continue;
    if (!/\.(md|txt|json|ya?ml|ts|mjs|js)$/i.test(filePath)) continue;
    const found = findMachineLocalPathHits(readFile(filePath));
    for (const hit of found) hits.push(`${filePath}:${hit}`);
  }
  return hits;
}

export function listPackageShippedFiles(packageRoot) {
  const out = [];
  for (const rel of PACKAGE_SHIPPED_ROOTS) {
    out.push(...walkFiles(path.join(packageRoot, rel)));
  }
  return out;
}

export function findUnsolicitedMcpServers(mcp) {
  const issues = [];
  if (!mcp || typeof mcp !== 'object') return issues;
  const servers = mcp.mcpServers && typeof mcp.mcpServers === 'object' ? mcp.mcpServers : {};
  for (const [name, spec] of Object.entries(servers)) {
    const key = String(name);
    if (UNSOLICITED_MCP_NAMES.has(key) || /cognee/i.test(key)) issues.push(key);
    const blob = JSON.stringify(spec ?? {});
    if (UNSOLICITED_PORT_RE.test(blob) || /:800[2-8]\b/.test(blob)) issues.push(`${key}:1c-bundle-port`);
  }
  return [...new Set(issues)];
}

export function inspectMcpJsonFile(filePath, readFile = (p) => fs.readFileSync(p, 'utf8')) {
  if (!filePath || !fs.existsSync(filePath)) return { exists: false, issues: [] };
  try {
    const mcp = JSON.parse(readFile(filePath));
    return { exists: true, issues: findUnsolicitedMcpServers(mcp) };
  } catch (error) {
    return { exists: true, issues: [`invalid-json:${error.message}`] };
  }
}

export function bootstrapWritesOptionalMcp(bootstrapSource) {
  if (!bootstrapSource) return false;
  return /mcpServers/.test(bootstrapSource) || /writeFileSync\([^)]*mcp\.json/.test(bootstrapSource);
}
