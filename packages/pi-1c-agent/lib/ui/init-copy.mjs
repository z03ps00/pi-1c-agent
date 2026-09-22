export const SOURCE_EMPTY = 'Пустая структура исходников (scaffold) — .dev.env и каталоги, без выгрузки ИБ';
export const SOURCE_DUMP = 'Выгрузка из существующей ИБ / .cf / .dt';
export const SOURCE_QUESTION = 'Источник проекта (первый вопрос /init)';
export const INIT_DETAILED = 'Подробный — пройти все переменные .dev.env (рекомендуется)';
export const INIT_QUICK = 'Быстрый — только ключевые решения, остальное upstream defaults';
export const SIBLING_QUESTION = 'Общие значения из соседних проектов';
export const SIBLING_ACCEPT_ALL = 'Принять все предложенные';
export const APPLY_QUESTION = 'Применить инициализацию?';
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
