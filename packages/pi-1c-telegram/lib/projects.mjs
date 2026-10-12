import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function expandPath(raw, { homedir = os.homedir() } = {}) {
  let project = String(raw ?? '').trim();
  if (
    (project.startsWith('"') && project.endsWith('"') && project.length >= 2)
    || (project.startsWith("'") && project.endsWith("'") && project.length >= 2)
  ) {
    project = project.slice(1, -1);
  }
  if (project === '~') return homedir;
  if (project.startsWith('~/') || project.startsWith('~\\')) return homedir + project.slice(1);
  return project;
}

export function isPathText(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.includes('\n')) return false;
  if (raw.startsWith('~/') || raw === '~' || raw.startsWith('./') || raw.startsWith('../')) return true;
  if (/^[A-Za-z]:[\\/]/.test(raw)) return true;
  return raw.startsWith('/') && raw.slice(1).includes('/');
}

export function acceptProject(raw, {
  roots = [],
  homedir = os.homedir(),
  exists = fs.existsSync,
  stat = fs.statSync,
  realpath = fs.realpathSync,
} = {}) {
  const expanded = expandPath(raw, { homedir });
  if (!expanded) return { ok: false, reason: 'missing' };
  let real;
  try {
    if (!exists(expanded) || !stat(expanded).isDirectory()) return { ok: false, reason: 'missing' };
    real = realpath(expanded);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  const allowed = [];
  for (const root of roots) {
    const expandedRoot = expandPath(root, { homedir });
    try {
      if (!exists(expandedRoot)) continue;
      allowed.push(realpath(expandedRoot));
    } catch {
      /* skip a root that cannot be resolved */
    }
  }
  const inside = allowed.some((root) => real === root || real.startsWith(root.endsWith(path.sep) ? root : root + path.sep));
  if (!inside) return { ok: false, reason: 'outside', path: real };
  return { ok: true, path: real };
}
