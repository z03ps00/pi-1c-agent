import { createHash, randomUUID } from 'node:crypto';

export function normalizeRecord(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.replace(/\r\n/g, '\n');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function contentHash(redactedText) {
  return createHash('sha256').update(normalizeRecord(redactedText), 'utf8').digest('hex');
}

export function buildIdempotencyKey({ task, agent, date, contentHash: hash } = {}) {
  const t = String(task ?? 'unknown').trim() || 'unknown';
  const a = String(agent ?? 'unknown').trim() || 'unknown';
  const d = String(date ?? '').trim() || new Date().toISOString().slice(0, 10);
  const h = String(hash ?? '').trim();
  return `task=${t}; agent=${a}; date=${d}; content_hash=${h}`;
}

export function mintCorrelationId() {
  return randomUUID();
}

export function parseIdempotencyKey(key) {
  const out = {};
  for (const part of String(key ?? '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}
