import fs from 'node:fs';
import path from 'node:path';

const RULES = [
  {
    kind: 'private_key',
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
  {
    kind: 'authorization',
    re: /(?:Authorization:\s*)?(?:Bearer|Basic)\s+[A-Za-z0-9._\-+/=]+/gi,
  },
  {
    kind: 'cookie',
    re: /(?:Set-Cookie|Cookie):\s*[^\r\n]+/gi,
  },
  {
    kind: 'dsn',
    re: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|https?):\/\/[^:\s/"']+:[^@\s/"']+@[^\s"'<>]+/gi,
  },
  {
    kind: 'api_key',
    re: /\b(?:sk-|rk-|ghp_|gho_|github_pat_|glpat-|npm_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    kind: 'token',
    re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  {
    kind: 'password',
    re: /(?:password|passwd|pwd|passphrase|ib_password|tilda_password)\s*[=:]\s*['"]?[^\s'"]+/gi,
  },
  {
    kind: 'secret_store',
    re: /(?:KNOWLEDGE_MCP_AUTHORIZATION|ROUTERAI_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|GITLAB_TOKEN|NPM_TOKEN|API_KEY|SECRET_KEY|ACCESS_KEY|SECRET|TOKEN|CREDENTIAL)[A-Za-z0-9_-]*\s*[=:]\s*(?:(['"])(?:\\.|(?!\1).)*\1|[^\s'"]+)/gi,
  },
  {
    kind: 'credential_field',
    re: /(?:^|[\s;])[A-Za-z0-9_-]*(?:SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|CREDENTIAL)[A-Za-z0-9_-]*\s*[=:]\s*(?:(['"])(?:\\.|(?!\1).)*\1|[^\s'"\n]+)/gi,
  },
];

const LEFTOVER = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /(?:password|passwd|pwd|passphrase)\s*[=:]\s*(?!'?\[REDACTED)/i,
  /(?:Bearer|Basic)\s+(?!\[REDACTED)[A-Za-z0-9._\-+/=]{8,}/i,
  /(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/[^:\s]+:(?!\[REDACTED)[^@\s]+@/i,
  /\b(?:sk-|rk-|ghp_|gho_|github_pat_|glpat-|npm_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/,
  /(?:secret|token|api[_-]?key|access[_-]?key|credential)[A-Za-z0-9_-]*\s*[=:]\s*(?!\[REDACTED)/i,
];

const SKIP_EXACT_VALUES = new Set(['', 'true', 'false', 'yes', 'no', 'on', 'off', '0', '1', 'utf-8', 'utf8']);
const SECRET_KEY_RE = /password|passwd|secret|token|key|authorization|cookie|credential|dsn/i;

export function parseEnvSecretValues(text) {
  const values = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value || SKIP_EXACT_VALUES.has(value.toLowerCase())) continue;
    if (SECRET_KEY_RE.test(key) || value.length >= 6) values.push(value);
  }
  return [...new Set(values)].sort((a, b) => b.length - a.length);
}

export function loadExactSecretValues({ cwd, envText } = {}) {
  if (typeof envText === 'string') return parseEnvSecretValues(envText);
  let cur = path.resolve(String(cwd || process.cwd()));
  while (true) {
    const file = path.join(cur, '.dev.env');
    try {
      if (fs.existsSync(file)) return parseEnvSecretValues(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return [];
}

export function redact(text, { exactValues = [] } = {}) {
  let out = String(text ?? '');
  const kinds = [];
  const extras = [...exactValues].filter(Boolean).sort((a, b) => String(b).length - String(a).length);
  for (const value of extras) {
    if (!value || SKIP_EXACT_VALUES.has(String(value).toLowerCase())) continue;
    if (!out.includes(value)) continue;
    out = out.split(value).join('[REDACTED:secret_value]');
    if (!kinds.includes('secret_value')) kinds.push('secret_value');
  }
  for (const rule of RULES) {
    const next = out.replace(rule.re, `[REDACTED:${rule.kind}]`);
    if (next !== out && !kinds.includes(rule.kind)) kinds.push(rule.kind);
    out = next;
  }
  return { text: out, kinds };
}

export function hasUnredactableSecret(text) {
  const raw = String(text ?? '');
  return LEFTOVER.some((re) => re.test(raw));
}

export function sanitizeForEgress(text, { cwd, exactValues } = {}) {
  const values = exactValues ?? loadExactSecretValues({ cwd });
  return redact(text, { exactValues: values });
}
