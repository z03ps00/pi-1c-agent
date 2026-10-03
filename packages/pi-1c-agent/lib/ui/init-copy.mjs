export const SOURCE_EMPTY = 'Пустая структура исходников (scaffold) — .dev.env и каталоги, без выгрузки ИБ';
export const SOURCE_DUMP = 'Выгрузка из существующей ИБ / .cf / .dt';
export const SOURCE_QUESTION = 'Источник проекта (первый вопрос /init)';
export const INIT_STANDARD = 'Стандартный — список находок, правки, одно подтверждение (рекомендуется)';
export const INIT_DETAILED = 'Подробный — пройти все переменные .dev.env';
export const INIT_QUICK = 'Быстрый — только ключевые решения, остальное upstream defaults';

export const INIT_SOURCE_INTRO = 'Откуда взять конфигурацию. Пустой /init открывает этот список, как /mode.';

export const INIT_SOURCE_CHOICES = [
  { value: 'empty', label: 'Пустой scaffold', description: '.dev.env и каталоги src/build/docs. Базу не создаёт и ничего не выгружает.' },
  { value: 'from-ib', label: 'Из существующей ИБ', description: 'выгрузить исходники из уже настроенной базы. Новую базу не создаёт.' },
  { value: 'from-cf', label: 'Из .cf', description: 'сначала спросит, нужна ли новая файловая база и выгрузка в src/. «Нет» — обычный /init.' },
  { value: 'from-cfe', label: 'Из .cfe', description: 'расширение. Сначала спросит про новую базу и выгрузку в src/cfe. «Нет» — обычный /init.' },
  { value: 'from-dt', label: 'Из .dt', description: 'выгрузка ИБ с данными. Сначала спросит про новую базу. «Нет» — обычный /init.' },
];

export const INIT_MODE_INTRO = 'Насколько подробно заполнять .dev.env. Стандартный — список находок и одно подтверждение.';

export const INIT_MODE_CHOICES = [
  { value: 'standard', label: 'Стандартный', description: 'список находок с соседних проектов, правки, одно «Всё верно».' },
  { value: 'quick', label: 'Быстрый', description: 'только ключевые решения, остальное upstream defaults.' },
  { value: 'advanced', label: 'Подробный', description: 'все переменные .dev.env по одной.' },
];
export const SIBLING_QUESTION = 'Общие значения из соседних проектов';
export const SIBLING_ACCEPT_ALL = 'Принять все предложенные';
export const APPLY_QUESTION = 'Применить инициализацию?';
export const STANDARD_REVIEW_QUESTION = 'Проверьте список настроек';
export const INIT_CONFIRM_ALL = 'Всё верно';
export const INIT_EDIT_ROW = 'Поправить';
export const INIT_CANCEL = 'Отмена';
export const KNOWLEDGE_NO_AGENT = 'Не копирует агента';
export const BUILD_SCAFFOLD_HINT = 'build/{cf,cfe,epf,erf}';
export const DOCS_SCAFFOLD_HINT = 'docs/techtask';

export const WIZARD_STEPS = Object.freeze(['Source', 'Project', '1C', 'Knowledge', 'Apply']);

export function wizardProgress(stepIndex) {
  const i = Math.max(0, Math.min(WIZARD_STEPS.length - 1, Number(stepIndex) || 0));
  return WIZARD_STEPS.map((name, idx) => `${idx === i ? '●' : (idx < i ? '✓' : '○')} ${idx + 1} ${name}`).join(' → ');
}

export function composeInitPreviewSummary({
  source = 'empty',
  configuration = '',
  sourceScaffold = false,
  buildScaffold = false,
  docsScaffold = false,
  knowledge = false,
  openSpec = false,
  files = [],
} = {}) {
  const lines = [
    'Ready to initialize',
    '',
    `Source      ${source}`,
    `Config      ${configuration || '—'}`,
    `src         ${sourceScaffold ? '✓' : '○'}`,
    `build       ${buildScaffold ? '✓' : '○'}`,
    `docs        ${docsScaffold ? '✓' : '○'}`,
    `Knowledge   ${knowledge ? '✓' : '○'}`,
    `OpenSpec    ${openSpec ? '✓' : '○'}`,
    '',
    'Will create/update:',
  ];
  for (const file of files.length ? files : ['.dev.env', '.pi/1c/project.yaml', '.pi/1c/init-state.json']) {
    lines.push(`  ${file}`);
  }
  return lines.join('\n');
}
