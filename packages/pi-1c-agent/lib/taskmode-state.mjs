export const TASKMODES = Object.freeze([
  'docs-fix',
  'spec-authoring',
  'analytics',
  'quick-fix',
  'full-cycle',
  'auto',
]);

export const DEFAULT_TASKMODE = 'auto';

const SHARED_KEY = '__PI_1C_TASKMODE__';

export const TASKMODE_META = Object.freeze({
  'docs-fix': {
    label: 'DOCS-FIX',
    footer: 'docs-fix',
    description: 'Prose only. Structure, links, consistency. No BSL validators.',
  },
  'spec-authoring': {
    label: 'SPEC-AUTHORING',
    footer: 'spec',
    description: 'OpenSpec requirements and plan. Confirm 1C facts. Implementation later.',
  },
  analytics: {
    label: 'ANALYTICS',
    footer: 'analytics',
    description: 'Explain or compare. Do not change sources.',
  },
  'quick-fix': {
    label: 'QUICK-FIX',
    footer: 'quick-fix',
    description: 'One local change: short plan, edit, applicable checks.',
  },
  'full-cycle': {
    label: 'FULL-CYCLE',
    footer: 'full-cycle',
    description: 'Requirements, implementation, result checks, review.',
  },
  auto: {
    label: 'AUTO',
    footer: 'auto',
    description: 'Drop the pin. Choose the path by triage.',
  },
});

const ALIASES = Object.freeze({
  docs: 'docs-fix',
  doc: 'docs-fix',
  docsfix: 'docs-fix',
  'docs-fix': 'docs-fix',
  spec: 'spec-authoring',
  specs: 'spec-authoring',
  specauthoring: 'spec-authoring',
  'spec-authoring': 'spec-authoring',
  analytics: 'analytics',
  analyze: 'analytics',
  analyse: 'analytics',
  quick: 'quick-fix',
  quickfix: 'quick-fix',
  'quick-fix': 'quick-fix',
  full: 'full-cycle',
  fullcycle: 'full-cycle',
  'full-cycle': 'full-cycle',
  auto: 'auto',
  off: 'auto',
  none: 'auto',
  clear: 'auto',
});

export function isTaskmode(value) {
  return TASKMODES.includes(value);
}

export function normalizeTaskmode(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!raw) return DEFAULT_TASKMODE;
  const mapped = ALIASES[raw] || ALIASES[raw.replace(/_/g, '-')];
  return isTaskmode(mapped) ? mapped : DEFAULT_TASKMODE;
}

/** Parses a `/taskmode` argument: { kind: 'pick' | 'status' | 'set' | 'invalid', path? }. */
export function parseTaskmode(arg) {
  const t = String(arg ?? '').trim().toLowerCase();
  if (!t) return { kind: 'pick' };
  if (t === 'status') return { kind: 'status' };
  const compact = t.replace(/\s+/g, '-').replace(/_/g, '-');
  const mapped = ALIASES[compact];
  if (isTaskmode(mapped)) return { kind: 'set', path: mapped };
  return { kind: 'invalid' };
}

export const TASKMODE_INTRO = 'Рабочий путь этой сессии. Не заменяет режим и не отменяет проверки.';

const TASKMODE_PICKER = Object.freeze({
  'docs-fix': 'только текст: структура, ссылки, согласованность. Проверки BSL не запускаются.',
  'spec-authoring': 'требования и план. Факты 1С подтверждаются, код пишется позже.',
  analytics: 'объяснить или сравнить. Исходники не меняются.',
  'quick-fix': 'одна локальная правка, короткий план и нужные проверки.',
  'full-cycle': 'требования, реализация, проверка результата и ревью.',
  auto: 'снять метку пути. Дальше путь выбирается по задаче.',
});

export function taskmodeChoices() {
  return TASKMODES.map((value) => ({
    value,
    label: TASKMODE_META[value].label,
    description: TASKMODE_PICKER[value],
  }));
}

export function taskmodeFooterLabel(path) {
  const key = normalizeTaskmode(path);
  return TASKMODE_META[key].footer;
}

export function describeTaskmode(path) {
  const key = normalizeTaskmode(path);
  return `${TASKMODE_META[key].label} — ${TASKMODE_META[key].description}`;
}

export function taskmodeNote(path) {
  const key = normalizeTaskmode(path);
  const pinned = key === 'auto'
    ? 'Work path: AUTO — choose docs-fix / spec-authoring / analytics / quick-fix / full-cycle by triage in rules-1c/AGENTS-UPSTREAM.md.'
    : `Work path: ${TASKMODE_META[key].label} — ${TASKMODE_META[key].description} Pinned for this session by /taskmode.`;
  return `# Current 1C work path
${pinned}
This is not /mode (ASK/PLAN/BUILD). Promotion triggers still raise the work to full-cycle. syntaxcheck of changed BSL stays mandatory. Metadata mutations still go through 1c-metadata-manage. Infobase operations still go through the matching command.`;
}

export function set1cTaskmode(path) {
  const value = normalizeTaskmode(path);
  globalThis[SHARED_KEY] = value;
  return value;
}

export function current1cTaskmode() {
  const value = globalThis[SHARED_KEY];
  return isTaskmode(value) ? value : DEFAULT_TASKMODE;
}

export function resetTaskmodeStateForTests() {
  delete globalThis[SHARED_KEY];
}
