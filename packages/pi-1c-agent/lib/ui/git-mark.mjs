import { spawnSync } from 'node:child_process';

const cache = new Map();

export function readGitMark(cwd, fallbackBranch = '') {
  const key = String(cwd || '');
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < 2000) return hit;
  let branch = fallbackBranch || '';
  let dirty = false;
  if (key) {
    try {
      const result = spawnSync('git', ['status', '--porcelain', '-b', '--untracked-files=no'], {
        cwd: key,
        encoding: 'utf8',
        timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (result.status === 0) {
        const lines = String(result.stdout || '').split(/\r?\n/).filter(Boolean);
        const match = (lines[0] || '').match(/^##\s+(\S+)/);
        if (match) branch = match[1].replace(/\.\.\..*$/, '');
        dirty = lines.slice(1).length > 0;
      }
    } catch { /* status is optional */ }
  }
  const mark = { at: now, branch, dirty };
  cache.set(key, mark);
  return mark;
}
