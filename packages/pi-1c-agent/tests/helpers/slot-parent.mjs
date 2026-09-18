#!/usr/bin/env node
import { acquireProfileSlot, releaseLease } from '../../lib/runtime-scheduler.mjs';

const profile = process.argv[2];
const holdMs = Number(process.argv[3] || 200);
const logFile = process.argv[4];
const limit = Number(process.env.PI_1C_MAX_SUBAGENTS || 4);
const lease = await acquireProfileSlot(profile, { limit, timeoutMs: 5_000, pollMs: 20 });
if (logFile) {
  const fs = await import('node:fs');
  fs.appendFileSync(logFile, JSON.stringify({ event: 'START', pid: process.pid, ts: Date.now(), slot: lease.slot }) + '\n');
}
await new Promise((r) => setTimeout(r, holdMs));
if (logFile) {
  const fs = await import('node:fs');
  fs.appendFileSync(logFile, JSON.stringify({ event: 'STOP', pid: process.pid, ts: Date.now(), slot: lease.slot }) + '\n');
}
releaseLease(lease);
process.exit(0);
