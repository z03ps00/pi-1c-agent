function line(label, value) {
  const v = value == null || value === '' ? '—' : String(value);
  return `  ${label.padEnd(14)} ${v}`;
}

const KNOWLEDGE_LABEL = Object.freeze({
  initialized: 'инициализированы',
  layout: 'каталоги',
  uninitialized: 'не инициализированы',
});

export function composeStatus(snapshot = {}) {
  const mode = String(snapshot.mode || 'ask').toUpperCase();
  const anon = Math.trunc(Number(snapshot.anonLevel) || 0);
  const approve = String(snapshot.approve || 'off');
  const pct = snapshot.contextPercent == null ? null : Math.round(Number(snapshot.contextPercent));
  const runs = Array.isArray(snapshot.agents) ? snapshot.agents : [];
  const active = runs.filter((r) => ['starting', 'working', 'waiting', 'testing', 'reviewing'].includes(String(r.status)));
  const git = snapshot.gitBranch ? `${snapshot.gitBranch}${snapshot.gitDirty ? ' · грязный' : ''}` : '—';
  const knowledge = KNOWLEDGE_LABEL[snapshot.knowledge] || snapshot.knowledge || 'не инициализированы';

  const lines = [
    'PI 1C Agent',
    '',
    'Проект',
    `  ${snapshot.projectName || '(неизвестно)'}`,
    snapshot.configuration ? `  Конфигурация ${snapshot.configuration}` : '  Конфигурация —',
    `  Git ${git}`,
    '',
    'Агент',
    line('Режим', mode),
    line('Подтверждение', approve),
    line('Анонимность', anon > 0 ? String(anon) : 'off'),
    '',
    'Память',
    line('Захват', snapshot.captureEnabled ? (snapshot.captureMode || 'вкл') : 'off'),
    line('Cognee', snapshot.cognee === 'unknown' || !snapshot.cognee ? 'неизвестно' : snapshot.cognee),
    line('OpenViking', snapshot.openviking === 'unknown' || !snapshot.openviking ? 'неизвестно' : snapshot.openviking),
    '',
    'Сеанс',
    line('Контекст', pct == null ? '—' : `${pct}%`),
    line('Ротация', snapshot.rotateEnabled ? `${snapshot.rotateThreshold ?? ''}%`.replace(/^%$/, 'вкл') : 'off'),
    '',
    'Агенты',
    `  ${active.length} в работе`,
  ];
  for (const run of runs.slice(0, 8)) {
    lines.push(`  ${(run.agent || run.name || 'agent').replace(/^1c-/, '')}      ${run.status || ''}`.trimEnd());
  }
  lines.push('', 'Знания', `  ${knowledge}`);
  if (snapshot.fingerprint) lines.push(`  отпечаток ${snapshot.fingerprint === 'current' ? 'актуален' : snapshot.fingerprint}`);
  return lines.join('\n');
}
