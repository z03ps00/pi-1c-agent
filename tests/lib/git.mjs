import { spawnSync } from 'node:child_process';
import { profileRoot } from './profile-root.mjs';

export function gitPorcelain(cwd = profileRoot()) {
  const r = spawnSync('git', ['status', '--porcelain'], {
    cwd,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`git status failed: ${r.stderr || r.stdout}`);
  }
  return String(r.stdout || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
}

export function porcelainDelta(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((line) => !beforeSet.has(line));
  const removed = before.filter((line) => !afterSet.has(line));
  return { added, removed };
}
