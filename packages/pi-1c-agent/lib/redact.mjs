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
    re: /\b(?:sk-|rk-|ghp_|gho_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/g,
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
    re: /(?:KNOWLEDGE_MCP_AUTHORIZATION|ROUTERAI_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY|SECRET_KEY|SECRET)\s*[=:]\s*['"]?[^\s'"]+/gi,
  },
];

const LEFTOVER = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /(?:password|passwd|pwd|passphrase)\s*[=:]\s*(?!'?\[REDACTED)/i,
  /(?:Bearer|Basic)\s+(?!\[REDACTED)[A-Za-z0-9._\-+/=]{8,}/i,
  /(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/[^:\s]+:(?!\[REDACTED)[^@\s]+@/i,
  /\b(?:sk-|rk-|ghp_|gho_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/,
];

export function redact(text) {
  let out = String(text ?? '');
  const kinds = [];
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
