import fs from 'node:fs';
import path from 'node:path';

export const FORBIDDEN_PROMPT_NAMES = ['help', 'plan', 'build', 'debug'];
export const DESTRUCTIVE_PROMPT_NAMES = [
  'update1cbase',
  'restore-testbase',
  'deploy-and-test',
  'build-release',
];

export function parseCommandTitle(md) {
  if (!md) return null;
  const m = String(md).match(/^#\s+(\/[^\s—]+)/m);
  return m ? m[1].replace(/[.,;:]+$/, '') : null;
}

export function findPromptFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n !== 'CATALOG.md')
    .map((n) => path.join(dir, n))
    .sort();
}

export function isAliasStub(md) {
  if (!md) return false;
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const descAlias = Boolean(fm && /^\s*description:\s*Alias of \//im.test(fm[1]));
  const bodyAlias = /This command is an alias of\s+`?\/[A-Za-z0-9._-]+/i.test(md);
  const followCanonical = /follow `prompts\/(?!1c-)[A-Za-z0-9._-]+\.md`/.test(md);
  return (descAlias || bodyAlias) && (bodyAlias || followCanonical);
}

export function isAliasPromptFile(filePath) {
  return /^1c-/.test(path.basename(filePath));
}

const CATALOG_SECTIONS = ['everyday', 'settings', 'maintainer'];

export function classifyCatalogSection(commandsMd, name) {
  if (!commandsMd || !name) return null;
  const needle = name.startsWith('/') ? name : `/${name}`;
  let current = null;
  for (const line of String(commandsMd).split(/\r?\n/)) {
    const heading = line.match(/^##\s+(Everyday|Settings|Maintainer)\b/i);
    if (heading) {
      current = heading[1].toLowerCase();
      continue;
    }
    if (!current) continue;
    if (line.includes(`\`${needle}\``) || line.includes(`| ${needle} `) || line.includes(`| ${needle}|`)) {
      return current;
    }
  }
  return null;
}

export function requiresTargetConfirmation(md) {
  if (!md) return false;
  return (
    /## Confirm the target infobase/.test(md) &&
    /Wait for explicit confirmation/.test(md)
  );
}
