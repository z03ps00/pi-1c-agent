import fs from 'node:fs';
import path from 'node:path';

export function normalizeProjectId(value) {
  return String(value ?? '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/[\\/]+$/, '')
    .replace(/\s+$/g, '')
    .replace(/^\s+/g, '')
    .toLowerCase();
}

export function normalizeWorkspacePath(cwd) {
  return String(cwd ?? '').replace(/[\\/]+$/, '').trim();
}

export function projectIdFromRemote(remote) {
  const raw = String(remote ?? '').trim();
  if (!raw) return '';
  const ssh = raw.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (ssh) return normalizeProjectId(ssh[1]);
  return normalizeProjectId(path.basename(raw));
}

export function readProjectIdMarker(cwd) {
  const root = normalizeWorkspacePath(cwd);
  if (!root) return '';
  const marker = path.join(root, '.pi', '1c', 'project-id');
  try {
    if (!fs.existsSync(marker)) return '';
    return normalizeProjectId(fs.readFileSync(marker, 'utf8').split(/\r?\n/, 1)[0]);
  } catch {
    return '';
  }
}

export function deriveProjectId({ cwd, gitRemote, marker, basename } = {}) {
  const fromRemote = projectIdFromRemote(gitRemote);
  if (fromRemote) return fromRemote;
  const fromMarker = normalizeProjectId(marker) || (cwd ? readProjectIdMarker(cwd) : '');
  if (fromMarker) return fromMarker;
  const base = basename
    || (cwd ? path.basename(normalizeWorkspacePath(cwd)) : '');
  return normalizeProjectId(base) || 'unknown';
}

export function projectScope(projectId) {
  return `project:${deriveProjectId({ basename: projectId })}`;
}
