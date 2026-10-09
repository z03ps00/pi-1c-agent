import { visibleWidth } from './theme.mjs';

/** Columns kept clear between the border and the text. */
export const FRAME_INSET = 2;

function clipVisible(text, width) {
  const limit = Math.max(0, width);
  const src = String(text ?? '');
  if (visibleWidth(src) <= limit) return src;
  let out = '';
  let seen = 0;
  for (let i = 0; i < src.length;) {
    const sgr = src.slice(i).match(/^\x1b\[[0-9;]*m/);
    if (sgr) {
      out += sgr[0];
      i += sgr[0].length;
      continue;
    }
    if (seen >= limit) break;
    out += src[i];
    seen += 1;
    i += 1;
  }
  if (src.includes('\x1b[')) out += '\x1b[0m';
  return out;
}

/** Outer width skips the last overlay column so the right corner stays visible. */
export function frameMetrics(width, inset = FRAME_INSET) {
  const requested = Math.max(1, Math.trunc(Number(width)) || 1);
  const outer = Math.max(1, requested - 1);
  const inner = Math.max(0, outer - 2);
  const room = Math.max(0, Math.floor((inner - 1) / 2));
  const insetUsed = Math.min(Math.max(0, inset), room);
  const contentWidth = Math.max(0, inner - insetUsed * 2);
  return { outer, inner, inset: insetUsed, contentWidth };
}

function fitContent(text, metrics) {
  const clipped = clipVisible(text, metrics.contentWidth);
  const gap = ' '.repeat(Math.max(0, metrics.contentWidth - visibleWidth(clipped)));
  const pad = ' '.repeat(metrics.inset);
  return `${pad}${clipped}${gap}${pad}`;
}

/**
 * Closed rectangle. Top, rows, and bottom share one visible width (`width - 1`).
 * The hint is the last inner row, with a blank row above it.
 */
export function composeFrame({ title, body, width, footer = '', inset = FRAME_INSET } = {}) {
  const metrics = frameMetrics(width, inset);
  const head = clipVisible(`─ ${String(title ?? '')} `, metrics.inner);
  const top = `╭${head}${'─'.repeat(Math.max(0, metrics.inner - visibleWidth(head)))}╮`;
  const lines = (Array.isArray(body) ? body : []).map((text) => ({
    kind: 'body',
    content: fitContent(text, metrics),
  }));
  if (footer) {
    lines.push({ kind: 'gap', content: fitContent('', metrics) });
    lines.push({ kind: 'footer', content: fitContent(footer, metrics) });
  }
  const bottom = `╰${'─'.repeat(metrics.inner)}╯`;
  return { ...metrics, top, lines, bottom };
}
