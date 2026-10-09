import fs from 'node:fs';
import path from 'node:path';
import { visibleWidth } from './theme.mjs';
import { taskmodeFooterLabel } from '../taskmode-state.mjs';

const SEP = ' │ ';

function shortModel(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  const parts = raw.split(/[/:]/);
  return parts[parts.length - 1] || raw;
}

function contextBar(percent, width = 8) {
  const n = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((n / 100) * width);
  return `${'━'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

function roundPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function nonNegInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

export const MCP_STATUS_EVENT = 'pi-mcp-adapter/status/v1';

export function mcpCountsFromAdapterSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { connected: 0, enabled: 0 };
  const servers = Array.isArray(snapshot.servers) ? snapshot.servers : [];
  const disabled = Number.isFinite(Number(snapshot.disabledCount))
    ? Math.max(0, Math.trunc(Number(snapshot.disabledCount)))
    : servers.filter((s) => s && (s.disabled === true || s.status === 'disabled')).length;
  const enabled = Math.max(0, servers.length - disabled);
  const connected = Number.isFinite(Number(snapshot.connectedCount))
    ? Math.max(0, Math.trunc(Number(snapshot.connectedCount)))
    : servers.filter((s) => s && s.status === 'connected').length;
  return { connected, enabled };
}

export function mcpCountsFromConfig(mcp) {
  const servers = mcp && typeof mcp === 'object' && mcp.mcpServers && typeof mcp.mcpServers === 'object'
    ? mcp.mcpServers
    : {};
  let enabled = 0;
  for (const def of Object.values(servers)) {
    if (def && typeof def === 'object' && def.disabled === true) continue;
    enabled++;
  }
  return { connected: 0, enabled };
}

export function mcpFooterLabel(snapshot = {}) {
  const connected = nonNegInt(snapshot.mcpConnected, 0);
  const enabled = nonNegInt(snapshot.mcpEnabled, connected);
  return `mcp ${connected}/${enabled}`;
}

export function thinkingFooterLabel(level) {
  const raw = String(level || 'off').trim().toLowerCase() || 'off';
  return `think ${raw}`;
}

export function rotateFooterLabel(snapshot = {}) {
  const on = snapshot.rotateEnabled === true;
  const th = roundPct(snapshot.rotateThreshold);
  const pct = th == null ? '85%' : `${th}%`;
  return on ? `rotate on ${pct}` : `rotate off ${pct}`;
}

export function footerSegments(snapshot = {}) {
  const mode = String(snapshot.mode || 'ask').toLowerCase();
  const modeLabel = mode === 'build' ? 'BUILD' : mode === 'plan' ? 'PLAN' : 'ASK';
  const segs = [{ id: 'mode', text: modeLabel, keep: true }];
  segs.push({ id: 'taskmode', text: taskmodeFooterLabel(snapshot.taskmode) });

  const anon = Math.trunc(Number(snapshot.anonLevel) || 0);
  const approve = String(snapshot.approve || 'off').toLowerCase();

  if (anon > 0) {
    segs.push({ id: 'anon', text: `ANON ${anon}` });
    segs.push({ id: 'memory', text: 'memory isolated' });
  } else if (mode === 'plan' || mode === 'ask') {
    segs.push({ id: 'readonly', text: 'read-only' });
  } else if (approve && approve !== 'off') {
    segs.push({ id: 'approve', text: approve });
  }

  if (mode === 'plan' && snapshot.planId) {
    const id = String(snapshot.planId);
    segs.push({ id: 'plan', text: `plan #${id.slice(-6)}` });
  }

  if (snapshot.projectName) segs.push({ id: 'project', text: String(snapshot.projectName) });

  if (snapshot.capabilityFooter) segs.push({ id: 'caps', text: String(snapshot.capabilityFooter) });

  const pct = roundPct(snapshot.contextPercent);
  if (pct != null) {
    segs.push({ id: 'ctx', text: `ctx ${pct}%` });
    segs.push({ id: 'bar', text: contextBar(pct) });
  }

  if (snapshot.gitBranch) {
    segs.push({ id: 'git', text: `${snapshot.gitBranch}${snapshot.gitDirty ? '*' : ''}` });
  }

  const learning = String(snapshot.learning || 'safe').toLowerCase();
  segs.push({ id: 'learning', text: `learning:${learning === 'auto' || learning === 'off' ? learning : 'safe'}` });

  if (snapshot.model) segs.push({ id: 'model', text: shortModel(snapshot.model) });

  segs.push({ id: 'mcp', text: mcpFooterLabel(snapshot) });
  segs.push({ id: 'thinking', text: thinkingFooterLabel(snapshot.thinkingLevel) });
  segs.push({ id: 'rotate', text: rotateFooterLabel(snapshot) });

  if (snapshot.captureEnabled) {
    const cap = snapshot.captureMode ? `capture ${snapshot.captureMode}` : 'capture on';
    segs.push({ id: 'capture', text: cap });
  }

  return segs;
}

/** Drop order for a narrow terminal (lowest priority first). Mode is never dropped. */
export const FOOTER_DROP_ORDER = Object.freeze([
  'bar', 'caps', 'project', 'capture', 'memory', 'plan', 'git', 'model', 'mcp', 'thinking', 'rotate', 'ctx', 'learning', 'approve', 'readonly', 'taskmode', 'anon',
]);

export function composeFooter(snapshot = {}, width = 80) {
  const max = Number.isFinite(Number(width)) ? Math.max(0, Math.trunc(Number(width))) : 80;
  const all = footerSegments(snapshot);
  const kept = [...all];
  const join = (items) => items.map((s) => s.text).join(SEP);

  for (const id of FOOTER_DROP_ORDER) {
    if (visibleWidth(join(kept)) <= max) break;
    const idx = kept.findIndex((s) => s.id === id && !s.keep);
    if (idx >= 0) kept.splice(idx, 1);
  }

  let text = join(kept);
  if (visibleWidth(text) > max) text = text.slice(0, max);
  const dropped = all.filter((s) => !kept.some((k) => k.id === s.id && k.text === s.text));
  return { text, segments: kept, dropped };
}

export function countOpenChanges(cwd) {
  const dir = path.join(String(cwd || ''), 'openspec', 'changes');
  if (!cwd || !fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .length;
}

function clipLine(text, width) {
  const max = Math.max(1, Number(width) || 80);
  if (visibleWidth(text) <= max) return text;
  return text.slice(0, max);
}

function named(label, value) {
  return `${label} ${value}`;
}

function aliasOf(map, value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return '';
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : String(value);
}

const MODE_ALIAS = Object.freeze({ ask: 'Вопрос', plan: 'Планирование', build: 'Реализация' });
const PATH_ALIAS = Object.freeze({
  auto: 'авто',
  'docs-fix': 'текст',
  'spec-authoring': 'спецификация',
  analytics: 'разбор',
  'quick-fix': 'быстрый фикс',
  'full-cycle': 'полный цикл',
});
const SCALE_ALIAS = Object.freeze({
  lite: 'кратко',
  standard: 'обычно',
  full: 'полно',
  on: 'вкл',
  off: 'выкл',
  economy: 'экономия',
});
const UI_ALIAS = Object.freeze({
  essential: 'важное',
  auto: 'само',
  manual: 'вручную',
  off: 'выкл',
  visible: 'видимо',
  hidden: 'скрыто',
});
const LEARN_ALIAS = Object.freeze({ off: 'выкл', safe: 'осторожно', auto: 'само' });
const THINK_ALIAS = Object.freeze({ off: 'выкл', low: 'низко', medium: 'средне', high: 'высоко' });
const CAPTURE_ALIAS = Object.freeze({ stack: 'стек', chat: 'чат', off: 'выкл', on: 'вкл' });
const APPROVE_ALIAS = Object.freeze({ safe: 'осторожно', strict: 'строго' });

function capabilityParts(text) {
  const raw = String(text || '');
  const graph = raw.match(/graph([✓✗])/);
  const code = raw.match(/code([✓✗])/);
  const ib = raw.match(/ib([✓✗])/);
  if (!graph && !code && !ib) return raw ? [{ id: 'caps', text: raw }] : [];
  const parts = [];
  if (graph) parts.push({ id: 'graph', text: `Граф ${graph[1]}` });
  if (code) parts.push({ id: 'code', text: `Код ${code[1]}` });
  if (ib) parts.push({ id: 'ibcap', text: `ИБ ${ib[1]}` });
  return parts;
}

export function composeWorkFooter(snapshot = {}, width = 80) {
  const mode = String(snapshot.mode || 'ask').trim().toLowerCase();
  const anon = Math.trunc(Number(snapshot.anonLevel) || 0);
  const approve = String(snapshot.approve || 'off').trim().toLowerCase();
  const primary = [
    { id: 'mode', text: named('Режим', aliasOf(MODE_ALIAS, mode)), keep: true },
    { id: 'taskmode', text: named('Путь', aliasOf(PATH_ALIAS, snapshot.taskmode || 'auto')) },
  ];
  if (anon > 0) primary.push({ id: 'anon', text: named('Доступ', `анонимность ${anon}`) });
  else if (mode === 'plan' || mode === 'ask') primary.push({ id: 'readonly', text: named('Доступ', 'чтение') });
  else if (APPROVE_ALIAS[approve]) primary.push({ id: 'approve', text: named('Доступ', APPROVE_ALIAS[approve]) });
  primary.push(
    { id: 'depth', text: named('Глубина', aliasOf(SCALE_ALIAS, snapshot.depth || 'standard')) },
    { id: 'economy', text: named('Экономия', aliasOf(SCALE_ALIAS, snapshot.economy || 'standard')) },
    { id: 'ui', text: named('Интерфейс', aliasOf(UI_ALIAS, snapshot.ui || 'essential')) },
    { id: 'learning', text: named('Обучение', aliasOf(LEARN_ALIAS, snapshot.learning || 'safe')) },
  );

  const secondary = [];
  if (snapshot.projectName) secondary.push({ id: 'project', text: named('Проект', snapshot.projectName) });
  secondary.push(...capabilityParts(snapshot.capabilityFooter));
  const pct = roundPct(snapshot.contextPercent);
  if (pct != null) {
    secondary.push({ id: 'ctx', text: `${named('Контекст', `${pct}%`)} ${contextBar(pct)}`, keep: true });
  }
  if (snapshot.model) secondary.push({ id: 'model', text: named('Модель', shortModel(snapshot.model)) });
  secondary.push({ id: 'mcp', text: `MCP Сервера ${nonNegInt(snapshot.mcpConnected, 0)}/${nonNegInt(snapshot.mcpEnabled, snapshot.mcpConnected)}` });
  secondary.push({ id: 'thinking', text: named('Мышление', aliasOf(THINK_ALIAS, snapshot.thinkingLevel || 'off')) });
  const rotateOn = snapshot.rotateEnabled === true;
  const rotatePct = roundPct(snapshot.rotateThreshold);
  secondary.push({
    id: 'rotate',
    text: named('Ротация', `${rotateOn ? 'вкл' : 'выкл'} ${rotatePct == null ? '85%' : `${rotatePct}%`}`),
  });
  if (snapshot.captureEnabled) {
    const cap = snapshot.captureMode ? aliasOf(CAPTURE_ALIAS, snapshot.captureMode) : 'вкл';
    secondary.push({ id: 'capture', text: named('Захват', cap) });
  }
  secondary.push({ id: 'changes', text: named('Изменения', nonNegInt(snapshot.changes, 0)) });
  if (snapshot.ibName) {
    const kind = snapshot.ibKind === 'server' ? 'сервер' : 'файл';
    secondary.push({ id: 'ib', text: named('База', `${kind} ${snapshot.ibName}`) });
  }
  if (snapshot.gitBranch) secondary.push({ id: 'git', text: named('Ветка', `${snapshot.gitBranch}${snapshot.gitDirty ? '*' : ''}`) });

  const dropSecondary = ['capture', 'rotate', 'git', 'changes', 'ib', 'thinking', 'mcp', 'model', 'project', 'graph', 'code', 'ibcap', 'caps'];
  const dropPrimary = ['learning', 'ui', 'economy', 'depth', 'taskmode', 'approve', 'readonly', 'anon'];
  const fit = (items, order) => {
    const kept = [...items];
    for (const id of order) {
      if (visibleWidth(kept.map((item) => item.text).join(SEP)) <= width) break;
      const index = kept.findIndex((item) => item.id === id && !item.keep);
      if (index >= 0) kept.splice(index, 1);
    }
    return { text: clipLine(kept.map((item) => item.text).join(SEP), width), parts: kept };
  };
  const primaryFit = fit(primary, dropPrimary);
  const secondaryFit = fit(secondary, dropSecondary);
  const rule = '─'.repeat(Math.max(8, Number(width) || 80));
  const groupGap = '\t';
  return {
    primary: primaryFit.text,
    secondary: secondaryFit.text,
    primaryParts: primary,
    secondaryParts: secondary,
    lines: [
      { kind: 'title', text: 'Сессия' },
      { kind: 'rule', text: rule },
      { kind: 'primary', text: primaryFit.text, parts: primaryFit.parts },
      { kind: 'gap', text: groupGap },
      { kind: 'title', text: 'Среда' },
      { kind: 'rule', text: rule },
      { kind: 'secondary', text: secondaryFit.text, parts: secondaryFit.parts },
    ],
  };
}

/** Screen column on a rendered footer line → segment id. Separator and clipped tails miss. */
export function segmentAt(line, parts, column) {
  const x = Math.trunc(Number(column));
  if (!Number.isFinite(x) || x < 0) return '';
  let cursor = 0;
  let rest = String(line ?? '');
  for (const part of parts || []) {
    const label = String(part?.text ?? '');
    if (!label || !rest.startsWith(label)) continue;
    const end = cursor + visibleWidth(label);
    if (x >= cursor && x < end) return String(part.id || '');
    cursor = end;
    rest = rest.slice(label.length);
    if (!rest.startsWith(SEP)) break;
    cursor += visibleWidth(SEP);
    rest = rest.slice(SEP.length);
  }
  return '';
}

export const FOOTER_SEGMENT_ACTIONS = Object.freeze({
  mode: 'command:mode',
  learning: 'command:learning',
  taskmode: 'command:taskmode',
  anon: 'command:anon',
  approve: 'command:approve',
  depth: 'command:sdlc',
  economy: 'command:economymode',
  ui: 'command:uitests',
  rotate: 'command:session-rotate',
  mcp: 'command:mcpconfig',
  capture: 'command:capture-model',
});
