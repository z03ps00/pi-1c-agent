import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_EVENTS = 200;
const recent = [];
const listeners = new Set();

function diagnosticsDir(profileDir) {
  const root = String(profileDir || process.env.PI_CODING_AGENT_DIR || '').trim();
  if (!root) return null;
  return path.join(root, 'state', 'runtime', 'diagnostics');
}

function appendJsonl(event, profileDir) {
  const dir = diagnosticsDir(profileDir);
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date(event.ts || Date.now()).toISOString().slice(0, 10);
    const line = `${JSON.stringify(event)}\n`;
    fs.appendFileSync(path.join(dir, `${day}.jsonl`), line);
  } catch {
    // diagnostics must never throw
  }
}

export function emitDiagnostic(code, details = {}) {
  const event = {
    ts: Date.now(),
    pid: process.pid,
    host: os.hostname(),
    code: String(code || 'unknown'),
    ...details,
  };
  recent.push(event);
  if (recent.length > MAX_EVENTS) recent.shift();
  for (const fn of listeners) {
    try { fn(event); } catch { /* diagnostic listeners must not throw */ }
  }
  appendJsonl(event, details.profileDir);
  if (process.env.PI_1C_DEBUG_DIAGNOSTICS === '1') {
    try { console.error(`[pi-1c] ${event.code}`, details); } catch { /* ignore */ }
  }
  return event;
}

export function diagnosticEvents() {
  return [...recent];
}

export function resetDiagnostics() {
  recent.length = 0;
}

export function onDiagnostic(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}
