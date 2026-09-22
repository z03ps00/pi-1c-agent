const ALWAYS_KEYS = Object.freeze([
  'PATH', 'PATHEXT', 'HOME', 'USER', 'USERNAME', 'LOGNAME', 'USERPROFILE',
  'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC',
  'PROGRAMDATA', 'PROGRAMFILES', 'ProgramFiles', 'ProgramFiles(x86)',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM',
  'NODE_PATH', 'NODE_OPTIONS', 'NODE_ENV',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'PI_SKIP_VERSION_CHECK', 'PI_OFFLINE', 'PI_PACKAGE_DIR',
]);

const PROVIDER_KEYS = Object.freeze([
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
  'ROUTERAI_API_KEY', 'ROUTERAI_ENDPOINT', 'ROUTERAI_MODEL',
  'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY',
  'MEMORY_OLLAMA_HOST', 'MEMORY_OLLAMA_PORT', 'OLLAMA_LLM_MODEL',
  'MEMORY_MCP_URL', 'KNOWLEDGE_MCP_URL', 'KNOWLEDGE_MCP_AUTHORIZATION',
  'COGNEE_DATASET',
]);

const PREFIXES = Object.freeze(['PI_1C_', 'PI_CODING_']);
const BLOCKED_API_KEY = /^(AWS_|GITHUB_|GITLAB_|GH_|DATABASE_)/i;

export function isAllowedChildEnvKey(key) {
  const name = String(key ?? '');
  if (!name) return false;
  if (ALWAYS_KEYS.includes(name) || PROVIDER_KEYS.includes(name)) return true;
  if (PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  if (/_API_KEY$/.test(name) && !BLOCKED_API_KEY.test(name)) return true;
  return false;
}

export function childProcessEnv(parentEnv = process.env, extra = {}) {
  const out = {};
  for (const [key, value] of Object.entries(parentEnv ?? {})) {
    if (value === undefined || value === null) continue;
    if (isAllowedChildEnvKey(key)) out[key] = String(value);
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}
