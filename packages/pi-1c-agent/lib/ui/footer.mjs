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

  const pct = roundPct(snapshot.contextPercent);
  if (pct != null) {
    segs.push({ id: 'ctx', text: `ctx ${pct}%` });
    segs.push({ id: 'bar', text: contextBar(pct) });
  }

  if (snapshot.gitBranch) {
    segs.push({ id: 'git', text: `${snapshot.gitBranch}${snapshot.gitDirty ? '*' : ''}` });
  }

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
  'bar', 'project', 'capture', 'memory', 'plan', 'git', 'model', 'mcp', 'thinking', 'rotate', 'ctx', 'approve', 'readonly', 'anon',
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
