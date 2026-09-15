import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCKER_COMMAND_RE,
  dockerBlockReason,
  dockerEngineReachable,
  dockerPolicyLabel,
  shouldHardBlockDocker,
} from '../lib/docker-policy.mjs';

test('docker command regex matches docker at segment start, not grep docker', () => {
  assert.equal(DOCKER_COMMAND_RE.test('docker ps'), true);
  assert.equal(DOCKER_COMMAND_RE.test('sudo docker compose up'), true);
  assert.equal(DOCKER_COMMAND_RE.test('grep docker README.md'), false);
});

test('product default allows docker when a socket exists', () => {
  const env = {};
  const existsSync = (p) => p === '/var/run/docker.sock';
  assert.equal(dockerEngineReachable({ env, existsSync }), true);
  assert.deepEqual(shouldHardBlockDocker({ env, reachable: true }), { block: false, kind: null });
  assert.equal(dockerBlockReason('bash', { command: 'docker ps' }, { env, reachable: true }), null);
  assert.equal(dockerPolicyLabel({ env, reachable: true }), 'product-allow');
});

test('PI_1C_BLOCK_DOCKER=1 hard-blocks even when docker is reachable', () => {
  const env = { PI_1C_BLOCK_DOCKER: '1' };
  const reason = dockerBlockReason('bash', { command: 'docker ps' }, { env, reachable: true });
  assert.ok(reason);
  assert.match(reason, /PI_1C_BLOCK_DOCKER=1/);
  assert.equal(dockerPolicyLabel({ env, reachable: true }), 'lab hard-block (PI_1C_BLOCK_DOCKER=1)');
});

test('missing socket auto-blocks without the AWG kill-switch as the only story', () => {
  const env = {};
  const reason = dockerBlockReason('bash', { command: 'podman ps' }, { env, reachable: false });
  assert.ok(reason);
  assert.match(reason, /engine socket not found/);
  assert.doesNotMatch(reason, /AWG/);
  assert.equal(dockerPolicyLabel({ env, reachable: false }), 'socket-unavailable auto-block');
});

test('DOCKER_HOST unix socket is checked; tcp host is treated as configured', () => {
  assert.equal(dockerEngineReachable({ env: { DOCKER_HOST: 'unix:///tmp/missing.sock' }, existsSync: () => false }), false);
  assert.equal(dockerEngineReachable({ env: { DOCKER_HOST: 'tcp://127.0.0.1:2375' }, existsSync: () => false }), true);
});
