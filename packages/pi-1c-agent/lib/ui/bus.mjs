const snapshots = new Map();
const listeners = new Set();
const actions = new Map();

export function publish(source, payload) {
  const key = String(source || '').trim();
  if (!key) return;
  snapshots.set(key, payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : payload);
  for (const fn of listeners) {
    try { fn(key, snapshots.get(key)); } catch { /* ignore listener errors */ }
  }
}

export function getSnapshot(source) {
  return snapshots.get(String(source || ''));
}

export function getAllSnapshots() {
  return Object.fromEntries(snapshots);
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function registerAction(id, handler) {
  const key = String(id || '').trim();
  if (!key) return;
  if (typeof handler === 'function') actions.set(key, handler);
  else actions.delete(key);
}

export function invokeAction(id, ...args) {
  const fn = actions.get(String(id || ''));
  if (typeof fn !== 'function') return undefined;
  return fn(...args);
}

export function listActions() {
  return [...actions.keys()];
}

export function resetUiBusForTests() {
  snapshots.clear();
  listeners.clear();
  actions.clear();
}
