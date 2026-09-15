import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Match docker/podman/mcp-ctl only as a command at the start of a shell
// segment (optionally prefixed by sudo/env/a path), so harmless strings like
// `grep docker README.md` are not blocked.
export const DOCKER_COMMAND_RE = /(^|[\n;&|`])\s*(?:sudo\s+)?(?:env\s+)?(?:[^\s]*\/)?(?:docker(?:-compose)?|podman|nerdctl|mcp-ctl\.sh)(?=[\s;&|`'"]|$)/i;

export const LAB_DOCKER_BLOCK_REASON = [
  '⛔ Docker недоступен агенту: PI_1C_BLOCK_DOCKER=1 (lab hard-block).',
  'Сеть pi на этой машине изолирована; контейнеры вне namespace обходят kill-switch.',
  'Выполни вручную в терминале хоста:',
  '  docker ps                 — проверка движка',
  '  ~/mcp-ctl.sh              — helper этой лаборатории (не единственный путь продукта)',
  '  ~/mcp-host.sh update     — обновление MCP на этой лаборатории',
  'Не пытайся обойти это. Сообщи эту команду пользователю.',
].join('\n');

export const SOCKET_DOCKER_BLOCK_REASON = [
  'Docker is unavailable here (engine socket not found). Detected once; will not retry docker in a loop.',
  'Host commands:',
  '  docker ps',
  '  docker compose ...',
  'Lab helper on this machine only: ~/mcp-ctl.sh',
].join('\n');

export function dockerSocketCandidates({ env = process.env, homedir = os.homedir(), platform = process.platform } = {}) {
  const host = env.DOCKER_HOST?.trim();
  if (host?.startsWith('unix://')) return [host.slice('unix://'.length)];
  const sockets = [
    '/var/run/docker.sock',
    path.join(homedir, '.docker', 'run', 'docker.sock'),
    path.join(homedir, '.docker', 'desktop', 'docker.sock'),
  ];
  if (platform === 'win32') sockets.push('\\\\.\\pipe\\docker_engine');
  return sockets;
}

export function dockerEngineReachable({ env = process.env, existsSync = fs.existsSync, homedir = os.homedir(), platform = process.platform } = {}) {
  const host = env.DOCKER_HOST?.trim();
  if (host) {
    if (host.startsWith('unix://')) return existsSync(host.slice('unix://'.length));
    if (host.startsWith('fd://')) return false;
    // tcp / ssh / npipe / http: engine is configured; do not hard-block.
    return true;
  }
  return dockerSocketCandidates({ env, homedir, platform }).some((p) => existsSync(p));
}

export function shouldHardBlockDocker({ env = process.env, reachable } = {}) {
  if (env.PI_1C_BLOCK_DOCKER === '1') return { block: true, kind: 'flag' };
  const ok = reachable ?? dockerEngineReachable({ env });
  if (!ok) return { block: true, kind: 'socket' };
  return { block: false, kind: null };
}

export function dockerPolicyLabel({ env = process.env, reachable } = {}) {
  if (env.PI_1C_BLOCK_DOCKER === '1') return 'lab hard-block (PI_1C_BLOCK_DOCKER=1)';
  const ok = reachable ?? dockerEngineReachable({ env });
  return ok ? 'product-allow' : 'socket-unavailable auto-block';
}

export function dockerBlockReason(toolName, input, opts = {}) {
  if (toolName !== 'bash') return null;
  const command = typeof input?.command === 'string' ? input.command : '';
  if (!DOCKER_COMMAND_RE.test(command)) return null;
  const decision = shouldHardBlockDocker(opts);
  if (!decision.block) return null;
  return decision.kind === 'flag' ? LAB_DOCKER_BLOCK_REASON : SOCKET_DOCKER_BLOCK_REASON;
}
