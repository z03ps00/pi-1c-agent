import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { terminateProcessTree } from '../lib/process-supervisor.mjs';

test('terminateProcessTree uses a process group on POSIX', () => {
  if (process.platform === 'win32') return;
  const calls = [];
  const result = terminateProcessTree({ pid: 4242, kill() {} }, 'SIGTERM', {
    platform: 'linux',
    kill(pid, signal) {
      calls.push({ pid, signal });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'process-group');
  assert.deepEqual(calls, [{ pid: -4242, signal: 'SIGTERM' }]);
});

test('terminateProcessTree falls back to the direct child when group kill fails', () => {
  let killed = '';
  const result = terminateProcessTree({
    pid: 7,
    kill(signal) { killed = signal; },
  }, 'SIGKILL', {
    platform: 'linux',
    kill() { throw new Error('no group'); },
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'child.kill');
  assert.equal(killed, 'SIGKILL');
});

test('terminateProcessTree stops a live child', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });
  assert.ok(child.pid);
  terminateProcessTree(child, 'SIGKILL');
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 3000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve('exited');
    });
  });
  assert.equal(exit, 'exited');
});
