const MAX_EVENTS = 200;
const recent = [];
const listeners = new Set();

export function emitDiagnostic(code, details = {}) {
  const event = {
    code: String(code || 'unknown'),
    ts: Date.now(),
    ...details,
  };
  recent.push(event);
  if (recent.length > MAX_EVENTS) recent.shift();
  for (const fn of listeners) {
    try { fn(event); } catch { /* diagnostic listeners must not throw */ }
  }
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
