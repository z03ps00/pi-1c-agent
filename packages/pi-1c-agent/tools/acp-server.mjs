#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createAcpBridge, piLaunch } from '../lib/acp-bridge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const profileDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.resolve(here, '..', '..', '..');
const launch = piLaunch(process.env);

function send(message) {
  try {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  } catch {
    // The client closed stdout. The process exits on stdin end.
  }
}

const bridge = createAcpBridge({
  send,
  log(line) {
    process.stderr.write(`pi-1c-acp: ${line}\n`);
  },
  spawnPi({ cwd }) {
    const child = spawn(launch.command, launch.args, {
      cwd,
      env: { ...process.env, PI_CODING_AGENT_DIR: profileDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    return child;
  },
});

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => bridge.pushClientChunk(chunk));
process.stdin.on('end', () => {
  bridge.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  bridge.stop();
  process.exit(0);
});
