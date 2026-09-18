export const MIN_NODE_VERSION = '22.19.0';

export function parseSemver(value) {
  const m = String(value ?? '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareSemver(a, b) {
  const left = typeof a === 'string' ? parseSemver(a) : a;
  const right = typeof b === 'string' ? parseSemver(b) : b;
  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function nodeMeetsMinimum(current = process.version, minimum = MIN_NODE_VERSION) {
  const cur = parseSemver(current);
  const min = parseSemver(minimum);
  if (!cur || !min) return false;
  return compareSemver(cur, min) >= 0;
}

export function formatNodeTooOld(current = process.version, minimum = MIN_NODE_VERSION) {
  const shown = String(current ?? '').trim() || 'unknown';
  return `FAIL: pi-1c-agent requires Node >=${minimum}\nCurrent: ${shown}`;
}

export function assertNodeVersion(current = process.version, minimum = MIN_NODE_VERSION) {
  if (nodeMeetsMinimum(current, minimum)) return { ok: true, current, minimum };
  return { ok: false, current, minimum, message: formatNodeTooOld(current, minimum) };
}
