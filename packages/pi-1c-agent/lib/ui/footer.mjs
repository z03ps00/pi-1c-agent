import { visibleWidth } from './theme.mjs';

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

export function footerSegments(snapshot = {}) {
  const mode = String(snapshot.mode || 'ask').toLowerCase();
  const modeLabel = mode === 'build' ? 'BUILD' : mode === 'plan' ? 'PLAN' : 'ASK';
  const segs = [{ id: 'mode', text: modeLabel, keep: true }];

  const anon = Math.trunc(Number(snapshot.anonLevel) || 0);
  const approve = String(snapshot.approve || 'off').toLowerCase();

  if (anon > 0) {
    segs.push({ id: 'anon', text: `ANON ${anon}` });
    segs.push({ id: 'memory', text: 'память изолирована' });
  } else if (mode === 'plan' || mode === 'ask') {
    segs.push({ id: 'readonly', text: 'чтение' });
  } else if (approve && approve !== 'off') {
    segs.push({ id: 'approve', text: approve });
  }

  if (mode === 'plan' && snapshot.planId) {
    const id = String(snapshot.planId);
    segs.push({ id: 'plan', text: `план #${id.slice(-6)}` });
  }

  if (snapshot.projectName) segs.push({ id: 'project', text: String(snapshot.projectName) });

  const pct = roundPct(snapshot.contextPercent);
  if (pct != null) {
    segs.push({ id: 'ctx', text: `ctx ${pct}%` });
    segs.push({ id: 'bar', text: contextBar(pct) });
  }

  if (snapshot.gitBranch) {
    segs.push({ id: 'git', text: `${snapshot.gitBranch}${snapshot.gitDirty ? '*' : ''}` });
  }

  if (snapshot.model) segs.push({ id: 'model', text: shortModel(snapshot.model) });

  if (snapshot.rotateEnabled) {
    const th = Number(snapshot.rotateThreshold);
    segs.push({ id: 'rotate', text: Number.isFinite(th) ? `ротация ${th}%` : 'ротация вкл' });
  }
  if (snapshot.captureEnabled) {
    const cap = snapshot.captureMode ? `захват ${snapshot.captureMode}` : 'захват вкл';
    segs.push({ id: 'capture', text: cap });
  }

  return segs;
}

/** Drop order for a narrow terminal (lowest priority first). Mode is never dropped. */
export const FOOTER_DROP_ORDER = Object.freeze([
  'bar', 'model', 'project', 'rotate', 'capture', 'memory', 'plan', 'git', 'ctx', 'approve', 'readonly', 'anon',
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
