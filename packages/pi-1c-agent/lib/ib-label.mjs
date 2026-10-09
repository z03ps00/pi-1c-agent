import path from 'node:path';

function looksSecret(value) {
  return /(?:^|[;&])\s*(?:pwd|password|usr|user)\s*=/i.test(String(value || ''));
}

export function infobaseLabel(values = {}) {
  const kindRaw = String(values.INFOBASE_KIND || '').trim().toLowerCase();
  const kind = kindRaw === 'server' ? 'server' : (kindRaw === 'file' ? 'file' : '');
  const raw = String(values.INFOBASE_PATH || '').trim();
  if (!raw || looksSecret(raw)) return { kind: kind || 'file', name: '' };
  const base = raw.split(/[\\/]/).filter(Boolean).pop() || '';
  const name = base.replace(/\.1cd$/i, '');
  if (!name || looksSecret(name) || name.includes('=')) return { kind: kind || 'file', name: '' };
  return { kind: kind || 'file', name: path.basename(name) };
}
