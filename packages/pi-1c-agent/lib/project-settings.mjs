import fs from 'node:fs';
import path from 'node:path';

export const SETTINGS_STATE_TYPE = 'pi-1c-project-settings';

export const DEFAULTS = Object.freeze({
  VERIFICATION_DEPTH: 'standard',
  UI_TESTING: 'essential',
  MCP_QA_CLIENT_VISIBLE: 'true',
  METADATA_PREVIEW: 'auto',
  CAVEMAN: 'auto',
  ORCHESTRATION: 'standard',
  AGENT_MODEL: '',
});

export const SDLC_CHOICES = [
  { value: 'lite', label: 'LITE', description: 'Reduced checks for eligible low-risk edits' },
  { value: 'standard', label: 'STANDARD', description: 'Default verification depth' },
  { value: 'full', label: 'FULL', description: 'All three static validators, full retry budget' },
];

export const UITESTS_CHOICES = [
  { value: 'essential', label: 'ESSENTIAL', description: 'Important new/changed UI only (UI_TESTING)' },
  { value: 'auto', label: 'AUTO', description: 'Every applicable UI scenario (UI_TESTING=auto)' },
  { value: 'manual', label: 'MANUAL', description: 'UI tests only on explicit request' },
  { value: 'off', label: 'OFF', description: 'Do not run UI tests' },
  { value: 'visible', label: 'VISIBLE', description: 'Test client on the desktop' },
  { value: 'hidden', label: 'HIDDEN', description: 'Test client on a hidden desktop' },
];

export const PREVIEW_CHOICES = [
  { value: 'on', label: 'ON', description: 'Preview every metadata write' },
  { value: 'auto', label: 'AUTO', description: 'Preview on the documented case list' },
  { value: 'off', label: 'OFF', description: 'Do not preview' },
  { value: 'once', label: 'ONCE', description: 'Session-only: next metadata write' },
];

export const CAVEMAN_CHOICES = [
  { value: 'on', label: 'ON', description: 'Terse style on every task (persisted)' },
  { value: 'auto', label: 'AUTO', description: 'On for development tasks only (persisted)' },
  { value: 'off', label: 'OFF', description: 'No automatic activation (persisted)' },
  { value: 'lite', label: 'LITE', description: 'Session verbosity only' },
  { value: 'full', label: 'FULL', description: 'Session verbosity only' },
  { value: 'ultra', label: 'ULTRA', description: 'Session verbosity only' },
];

export const ECONOMY_CHOICES = [
  { value: 'on', label: 'ON', description: 'ORCHESTRATION=economy' },
  { value: 'off', label: 'OFF', description: 'ORCHESTRATION=standard' },
];

export const ECONOMY_PRESET_CHOICES = [
  { value: 'economy', label: 'ECONOMY', description: 'Cheapest tier models' },
  { value: 'balanced', label: 'BALANCED', description: 'Recommended mix' },
  { value: 'quality', label: 'QUALITY', description: 'Strongest tier models' },
  { value: 'custom', label: 'CUSTOM', description: 'Type three slugs' },
  { value: 'inherit', label: 'INHERIT', description: 'Leave SUBAGENT_MODEL_* empty' },
];

export const ECONOMY_CLIENT_CHOICES = [
  { value: 'cursor', label: 'CURSOR', description: 'Cursor agent ids' },
  { value: 'claude', label: 'CLAUDE CODE', description: 'opus / sonnet / haiku' },
  { value: 'codex', label: 'CODEX', description: 'gpt-5.6 family' },
  { value: 'opencode', label: 'OPENCODE', description: 'provider/model ids' },
  { value: 'other', label: 'OTHER', description: 'Type three slugs' },
];

export const RULESMODEL_CHOICES = [
  { value: 'opus5', label: 'OPUS5', description: 'Claude Opus 5' },
  { value: 'sonnet5', label: 'SONNET5', description: 'Claude Sonnet 5' },
  { value: 'fable5', label: 'FABLE5', description: 'Claude Fable 5 / Mythos 5' },
  { value: 'gpt56', label: 'GPT56', description: 'GPT-5.6' },
  { value: 'gpt6', label: 'GPT6', description: 'GPT-6 Astra' },
  { value: 'off', label: 'OFF', description: 'Base model-neutral ruleset' },
];

export const ECONOMY_PRESETS = Object.freeze({
  cursor: {
    economy: ['glm-5.2-max', 'glm-5.2-max', 'composer-2.5-fast'],
    balanced: ['gpt-5.6-sol-max', 'glm-5.2-max', 'composer-2.5-fast'],
    quality: ['claude-opus-4-8-thinking-high', 'gpt-5.6-sol-max', 'cursor-grok-4.5-high-fast'],
  },
  claude: {
    economy: ['sonnet', 'sonnet', 'haiku'],
    balanced: ['opus', 'sonnet', 'haiku'],
    quality: ['opus', 'opus', 'sonnet'],
  },
  codex: {
    economy: ['gpt-5.6-terra', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    balanced: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    quality: ['gpt-5.6-sol', 'gpt-5.6-sol', 'gpt-5.6-terra'],
  },
  opencode: {
    economy: ['anthropic/claude-haiku-4-5', 'anthropic/claude-sonnet-4-5', 'anthropic/claude-haiku-4-5'],
    balanced: ['anthropic/claude-opus-4-5', 'anthropic/claude-sonnet-4-5', 'anthropic/claude-haiku-4-5'],
    quality: ['anthropic/claude-opus-4-5', 'anthropic/claude-opus-4-5', 'anthropic/claude-sonnet-4-5'],
  },
});

const DEPTHS = new Set(['lite', 'standard', 'full']);

export function parseSdlcArgs(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  if (DEPTHS.has(t)) return { kind: 'set', depth: t };
  return { kind: 'invalid' };
}

export function parseLitemodeArgs(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  if (t === 'on' || t === 'lite') return { kind: 'set', depth: 'lite' };
  if (t === 'off') return { kind: 'set', depth: 'standard' };
  if (DEPTHS.has(t)) return { kind: 'set', depth: t };
  return { kind: 'invalid' };
}

export function parseUitestsArgs(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  if (t === 'essential') return { kind: 'set', key: 'UI_TESTING', value: 'essential' };
  if (t === 'on' || t === 'auto') return { kind: 'set', key: 'UI_TESTING', value: 'auto' };
  if (t === 'manual') return { kind: 'set', key: 'UI_TESTING', value: 'manual' };
  if (t === 'off') return { kind: 'set', key: 'UI_TESTING', value: 'off' };
  if (t === 'visible') return { kind: 'set', key: 'MCP_QA_CLIENT_VISIBLE', value: 'true' };
  if (t === 'hidden') return { kind: 'set', key: 'MCP_QA_CLIENT_VISIBLE', value: 'false' };
  return { kind: 'invalid' };
}

export function parsePreviewArgs(arg) {
  const t = String(arg ?? '').trim().toLowerCase().replace(/[.,;:]+$/, '');
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  if (t === 'on' || t === 'auto' || t === 'off') return { kind: 'set', value: t };
  if (t === 'once') return { kind: 'once' };
  return { kind: 'invalid' };
}

export function parseCavemanArgs(arg) {
  const t = String(arg ?? '').trim().toLowerCase().replace(/[.,;:]+$/, '');
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  if (t === 'on' || t === 'off' || t === 'auto') return { kind: 'set', value: t, persist: true };
  if (t === 'lite' || t === 'full' || t === 'ultra') return { kind: 'set', value: t, persist: false };
  return { kind: 'invalid' };
}

export function parseEconomyArgs(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  if (t === 'on') return { kind: 'set', value: 'economy' };
  if (t === 'off') return { kind: 'set', value: 'standard' };
  if (t === 'models') return { kind: 'models' };
  if (t === 'rtk') return { kind: 'rtk' };
  return { kind: 'invalid' };
}

const RULES_ALIASES = Object.freeze({
  opus5: 'opus5',
  opus: 'opus5',
  claudeopus5: 'opus5',
  sonnet5: 'sonnet5',
  sonnet: 'sonnet5',
  claudesonnet5: 'sonnet5',
  fable5: 'fable5',
  fable: 'fable5',
  mythos5: 'fable5',
  mythos: 'fable5',
  claudefable5: 'fable5',
  gpt56: 'gpt56',
  gpt5: 'gpt56',
  gpt6: 'gpt6',
  astra: 'gpt6',
  astra6: 'gpt6',
  gpt6astra: 'gpt6',
});

function compactModelToken(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^anthropic\//, '')
    .replace(/^openai\//, '')
    .replace(/^claude-?/, '')
    .replace(/^gpt-?/, '')
    .replace(/[#].*$/, '')
    .replace(/-thinking.*$/, '')
    .replace(/-high$/, '')
    .replace(/-max$/, '')
    .replace(/-fast$/, '')
    .replace(/[\s._-]+/g, '');
}

export function normalizeRulesmodel(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t) return '';
  if (t === 'off' || t === 'none' || t === 'generic' || t === 'сброс') return 'off';
  const compact = compactModelToken(t);
  if (RULES_ALIASES[compact]) return RULES_ALIASES[compact];
  if (compact === '56' || compact === '56luna' || compact === '56sol' || compact === '56terra') return 'gpt56';
  if (compact === '6' || compact === '6astra') return 'gpt6';
  const ru = t.replace(/\s+/g, '');
  if (/клод?опус5/.test(ru) || ru === 'опус5') return 'opus5';
  if (/сонет5/.test(ru)) return 'sonnet5';
  if (/фейбл5|мифос5/.test(ru)) return 'fable5';
  if (/гпт5\.?6/.test(ru) || ru === 'гпт56') return 'gpt56';
  if (/гпт6/.test(ru)) return 'gpt6';
  return '';
}

export function parseRulesmodelArgs(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t || t === 'auto') return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  const slug = normalizeRulesmodel(t);
  if (slug) return { kind: 'set', value: slug === 'off' ? '' : slug };
  return { kind: 'invalid' };
}

export function effectiveValue(fileValue, sessionValue, fallback) {
  if (sessionValue !== undefined && sessionValue !== null && String(sessionValue) !== '') return String(sessionValue);
  if (fileValue !== undefined && fileValue !== null && String(fileValue).trim() !== '') return String(fileValue).trim();
  return fallback;
}

export function detectEconomyClient(cwd) {
  try {
    const p = path.join(String(cwd || ''), '.ai-rules.json');
    if (!fs.existsSync(p)) return null;
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tools = []
      .concat(json.activeTools || [])
      .concat(json.tools || [])
      .map((x) => String(x).toLowerCase());
    if (tools.some((t) => t.includes('cursor'))) return 'cursor';
    if (tools.some((t) => t.includes('claude'))) return 'claude';
    if (tools.some((t) => t.includes('codex'))) return 'codex';
    if (tools.some((t) => t.includes('opencode'))) return 'opencode';
  } catch {
    return null;
  }
  return null;
}

export function settingsNote(state = {}) {
  const lines = ['# Project settings (session)'];
  if (state.VERIFICATION_DEPTH) lines.push(`- VERIFICATION_DEPTH=${state.VERIFICATION_DEPTH} (session or project).`);
  if (state.UI_TESTING) lines.push(`- UI_TESTING=${state.UI_TESTING}.`);
  if (state.MCP_QA_CLIENT_VISIBLE) lines.push(`- MCP_QA_CLIENT_VISIBLE=${state.MCP_QA_CLIENT_VISIBLE}.`);
  if (state.METADATA_PREVIEW) lines.push(`- METADATA_PREVIEW=${state.METADATA_PREVIEW}.`);
  if (state.previewOnce) lines.push('- Preview the next metadata write once, then return to the persisted value.');
  if (state.CAVEMAN) lines.push(`- CAVEMAN=${state.CAVEMAN} (persisted preference).`);
  if (state.cavemanSession) lines.push(`- Caveman session level: ${state.cavemanSession}.`);
  if (state.ORCHESTRATION) lines.push(`- ORCHESTRATION=${state.ORCHESTRATION}.`);
  if (state.AGENT_MODEL) lines.push(`- AGENT_MODEL=${state.AGENT_MODEL}. Load rules-1c/rules/model-${state.AGENT_MODEL}.md.`);
  if (state.SUBAGENT_MODEL_CODING) lines.push(`- SUBAGENT_MODEL_CODING=${state.SUBAGENT_MODEL_CODING}.`);
  if (state.SUBAGENT_MODEL_ANALYSIS) lines.push(`- SUBAGENT_MODEL_ANALYSIS=${state.SUBAGENT_MODEL_ANALYSIS}.`);
  if (state.SUBAGENT_MODEL_LIGHT) lines.push(`- SUBAGENT_MODEL_LIGHT=${state.SUBAGENT_MODEL_LIGHT}.`);
  if (lines.length === 1) return '';
  lines.push('- These switches do not waive promotion triggers, syntaxcheck, or metadata/IB hard gates.');
  return lines.join('\n');
}
