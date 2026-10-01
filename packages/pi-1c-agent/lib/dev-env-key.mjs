import fs from 'node:fs';
import path from 'node:path';

const KEY = /^[A-Z][A-Z0-9_]*$/;

export function devEnvPath(cwd) {
  return path.join(String(cwd || ''), '.dev.env');
}

export function parseEnvValues(raw) {
  const out = {};
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function readDevEnvFile(cwd) {
  const file = devEnvPath(cwd);
  if (!cwd || !fs.existsSync(file)) return { exists: false, raw: '', values: {} };
  const raw = fs.readFileSync(file, 'utf8');
  return { exists: true, raw, values: parseEnvValues(raw) };
}

export function readDevEnvKey(cwd, name) {
  const { exists, values } = readDevEnvFile(cwd);
  const raw = exists && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name] ?? '') : '';
  return { exists, value: raw };
}

/**
 * Rewrite one key in an existing .dev.env. Does not create the file.
 * @returns {{ ok: boolean, persisted: boolean, reason?: string }}
 */
export function setDevEnvKey(cwd, name, value, comment) {
  return setDevEnvKeys(cwd, { [name]: { value, comment } });
}

export function setDevEnvKeys(cwd, updates) {
  const names = Object.keys(updates || {});
  for (const name of names) {
    if (!KEY.test(name)) return { ok: false, persisted: false, reason: 'invalid-key' };
    const value = String(updates[name]?.value ?? updates[name] ?? '');
    if (/\r|\n/.test(value)) return { ok: false, persisted: false, reason: 'multiline' };
  }
  const file = devEnvPath(cwd);
  if (!cwd || !fs.existsSync(file)) return { ok: false, persisted: false, reason: 'missing' };
  let raw = fs.readFileSync(file, 'utf8');
  for (const name of names) {
    const spec = updates[name];
    const value = String(spec?.value ?? spec ?? '');
    const comment = typeof spec === 'object' && spec && spec.comment ? String(spec.comment) : '';
    const lineRe = new RegExp(`^${name}=.*$`, 'm');
    const next = comment && !lineRe.test(raw) ? `${name}=${value}  ${comment}` : `${name}=${value}`;
    if (lineRe.test(raw)) raw = raw.replace(lineRe, `${name}=${value}`);
    else raw = `${raw.replace(/\n*$/, '\n')}${next}\n`;
  }
  fs.writeFileSync(file, raw, { encoding: 'utf8', mode: 0o600 });
  return { ok: true, persisted: true };
}
