import { spawnSync } from 'node:child_process';

export function terminateProcessTree(child, signal = 'SIGTERM', { platform = process.platform, kill = process.kill } = {}) {
  const pid = Number(child?.pid);
  if (!Number.isFinite(pid) || pid <= 0) return { ok: false, reason: 'missing pid' };
  if (platform === 'win32') {
    const args = ['/PID', String(pid), '/T'];
    if (signal === 'SIGKILL' || signal === 'SIGTERM') args.push('/F');
    const ran = spawnSync('taskkill', args, { stdio: 'ignore', windowsHide: true });
    if (ran.status === 0) return { ok: true, method: 'taskkill' };
    try {
      child.kill();
      return { ok: true, method: 'child.kill' };
    } catch {
      return { ok: false, reason: 'taskkill failed' };
    }
  }
  try {
    kill(-pid, signal);
    return { ok: true, method: 'process-group' };
  } catch {
    try {
      if (typeof child.kill === 'function') child.kill(signal);
      else kill(pid, signal);
      return { ok: true, method: 'child.kill' };
    } catch {
      return { ok: false, reason: 'kill failed' };
    }
  }
}
