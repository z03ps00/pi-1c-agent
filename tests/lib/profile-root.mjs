import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = path.dirname(fileURLToPath(import.meta.url));

/** Profile git root, resolved from this file — never a hardcoded absolute path. */
export function profileRoot() {
  return path.resolve(libDir, '..', '..');
}

export function testsRoot() {
  return path.resolve(libDir, '..');
}

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

/** Runtime files the product ships; not tests, OpenSpec change drafts, or git metadata. */
export const PROFILE_SHIPPED_ROOTS = [
  'AGENTS.md',
  'README.md',
  'NOTICE',
  'LAB-EXTRAS.md',
  'UPSTREAM-REGISTER.md',
  'upstream.lock.json',
  'settings.json',
  'mcp.json',
  'mcp.optional',
  'prompts',
  'agents',
  'skills',
  'rules-1c',
];

export function listProfileShippedFiles(root = profileRoot()) {
  const out = [];
  for (const rel of PROFILE_SHIPPED_ROOTS) {
    out.push(...walkFiles(path.join(root, rel)));
  }
  return out;
}
