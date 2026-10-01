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

export const SDLC_INTRO = 'Глубина проверок (VERIFICATION_DEPTH). syntaxcheck на задетых модулях остаётся. UI-тесты не меняет.';

export const SDLC_CHOICES = [
  { value: 'lite', label: 'lite', description: 'меньше проверок на мелкой правке.' },
  { value: 'standard', label: 'standard', description: 'обычный набор. Это значение по умолчанию.' },
  { value: 'full', label: 'full', description: 'все три статические проверки и полный бюджет повторов.' },
];

export const LITEMODE_INTRO = 'Та же глубина проверок, но lite ещё выключает UI-тесты.';

export const LITEMODE_CHOICES = [
  { value: 'lite', label: 'lite', description: 'глубина lite и UI_TESTING=off.' },
  { value: 'standard', label: 'standard', description: 'обычная глубина. UI-тесты не трогает.' },
  { value: 'full', label: 'full', description: 'полная глубина. UI-тесты не трогает.' },
];

export const UITESTS_INTRO = 'Когда гонять UI-тесты и где показывать клиент тестирования. Само окно тесты не запускает.';

export const UITESTS_CHOICES = [
  { value: 'essential', label: 'essential', description: 'только важное новое или изменённое поведение.' },
  { value: 'auto', label: 'auto', description: 'все подходящие UI-сценарии.' },
  { value: 'manual', label: 'manual', description: 'только по явной просьбе.' },
  { value: 'off', label: 'off', description: 'UI-тесты не запускать.' },
  { value: 'visible', label: 'visible', description: 'окно клиента тестирования на рабочем столе.' },
  { value: 'hidden', label: 'hidden', description: 'клиент на скрытом рабочем столе.' },
];

export const PREVIEW_INTRO = 'Показывать ли diff перед записью метаданных.';

export const PREVIEW_CHOICES = [
  { value: 'on', label: 'on', description: 'перед каждой такой записью.' },
  { value: 'auto', label: 'auto', description: 'только в оговорённых случаях. Это значение по умолчанию.' },
  { value: 'off', label: 'off', description: 'не показывать.' },
  { value: 'once', label: 'once', description: 'только следующая запись. Файл .dev.env не меняется.' },
];

export const CAVEMAN_INTRO = 'Короткий стиль ответов. Проверки и запреты не ослабляет.';

export const CAVEMAN_CHOICES = [
  { value: 'on', label: 'on', description: 'короткий стиль на всех задачах. Пишется в .dev.env.' },
  { value: 'auto', label: 'auto', description: 'короткий стиль только на разработке. Пишется в .dev.env.' },
  { value: 'off', label: 'off', description: 'само не включается. Пишется в .dev.env.' },
  { value: 'lite', label: 'lite', description: 'чуть короче, только эта сессия.' },
  { value: 'full', label: 'full', description: 'короткий стиль, только эта сессия.' },
  { value: 'ultra', label: 'ultra', description: 'максимально коротко, только эта сессия.' },
];

export const ECONOMY_INTRO = 'Отдавать работу субагентам, чтобы основной агент тратил меньше токенов. Модели субагентов — /economymode models.';

export const ECONOMY_CHOICES = [
  { value: 'on', label: 'on', description: 'режим economy.' },
  { value: 'off', label: 'off', description: 'обычный режим. Модели субагентов не меняет.' },
];

export const ECONOMY_PRESET_INTRO = 'Набор моделей для ролей coding, analysis и light.';

export const ECONOMY_PRESET_CHOICES = [
  { value: 'economy', label: 'economy', description: 'самые дешёвые.' },
  { value: 'balanced', label: 'balanced', description: 'средний набор.' },
  { value: 'quality', label: 'quality', description: 'самые сильные.' },
  { value: 'custom', label: 'custom', description: 'ввести три имени вручную.' },
  { value: 'inherit', label: 'inherit', description: 'не записывать модели. Субагенты как у родителя.' },
];

export const ECONOMY_CLIENT_INTRO = 'Для какого клиента подставить известные модели субагентов.';

export const ECONOMY_CLIENT_CHOICES = [
  { value: 'cursor', label: 'cursor', description: 'имена моделей Cursor.' },
  { value: 'claude', label: 'claude', description: 'opus / sonnet / haiku.' },
  { value: 'codex', label: 'codex', description: 'семейство gpt-5.6.' },
  { value: 'opencode', label: 'opencode', description: 'имена provider/model.' },
  { value: 'other', label: 'other', description: 'три имени ввести вручную.' },
];

export const RULESMODEL_INTRO = 'Какой профиль правил подгружать под модель. Проверки не ослабляет.';

export const RULESMODEL_CHOICES = [
  { value: 'opus5', label: 'opus5', description: 'профиль Claude Opus 5.' },
  { value: 'sonnet5', label: 'sonnet5', description: 'профиль Claude Sonnet 5.' },
  { value: 'fable5', label: 'fable5', description: 'профиль Claude Fable 5 / Mythos 5.' },
  { value: 'gpt56', label: 'gpt56', description: 'профиль GPT-5.6.' },
  { value: 'gpt6', label: 'gpt6', description: 'профиль GPT-6 Astra.' },
  { value: 'off', label: 'off', description: 'базовый свод без профиля модели.' },
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
