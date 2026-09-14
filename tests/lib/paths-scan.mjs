import fs from 'node:fs';
import path from 'node:path';
import { profileRoot } from './profile-root.mjs';

const DEVOPS_STAIN = 'Devops' + 'Moments';

export function isExamplePath(filePath) {
  return /\.example(\.|$)/i.test(path.basename(filePath));
}

function stripDocPlaceholders(text) {
  return String(text ?? '')
    .replace(/\/home\/<user>\//g, '')
    .replace(/C:[/\\]Users[/\\]<someone>/gi, '')
    .replace(/C:\\Users\\<someone>/gi, '')
    .replace(/\/mnt\/vol_\*/g, '')
    .replace(/[CD]:[\\/]1[CСC]_Базы/gi, '');
}

function stripIgnoredRoots(text, ignoreRoots) {
  let scanned = stripDocPlaceholders(text);
  for (const root of ignoreRoots) {
    if (!root) continue;
    scanned = scanned.split(root).join('<PROFILE_ROOT>');
    const trimmed = root.replace(/[\\/]+$/, '');
    if (trimmed && trimmed !== root) scanned = scanned.split(trimmed).join('<PROFILE_ROOT>');
  }
  return scanned;
}

/**
 * Hits for foreign home / volume / drive roots.
 * `$PI_CODING_AGENT_DIR` and other env placeholders do not match.
 */
export function findMachineLocalPathHits(text, { ignoreRoots = [] } = {}) {
  const scanned = stripIgnoredRoots(text, ignoreRoots);
  if (!scanned) return [];
  const hits = [];
  if (scanned.includes(DEVOPS_STAIN)) hits.push(DEVOPS_STAIN);
  if (/(?:^|[^$\w])(?:[CD]:[\\/]Users[\\/](?![<])|[CD]:\\Users\\(?![<]))/i.test(scanned)) {
    hits.push('absolute-user-home');
  }
  if (/[CD]:[\\/]1[CСC]_Базы/i.test(scanned)) hits.push('absolute-ib-root');
  if (/\/home\/[A-Za-z0-9._-]+\//.test(scanned)) hits.push('absolute-linux-home');
  if (/\/mnt\/vol_\d+/.test(scanned)) hits.push('volume-mount');
  return hits;
}

export function scanMachineLocalPaths(
  files,
  {
    readFile = (p) => fs.readFileSync(p, 'utf8'),
    ignoreRoots = [profileRoot()],
  } = {},
) {
  const hits = [];
  for (const filePath of files) {
    if (isExamplePath(filePath)) continue;
    if (!/\.(md|txt|json|ya?ml|ts|mjs|js)$/i.test(filePath) && path.basename(filePath) !== 'NOTICE') {
      continue;
    }
    const found = findMachineLocalPathHits(readFile(filePath), { ignoreRoots });
    for (const hit of found) hits.push(`${filePath}:${hit}`);
  }
  return hits;
}
