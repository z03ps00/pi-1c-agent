/** Left/right chat panels. The user panel keeps Pi's own box; the agent gets the same box with a pi label. */

const SIDES = Object.freeze({
  AssistantMessageComponent: 'left',
  UserMessageComponent: 'right',
});

const MESSAGE_GAP = '\t';

const IDENTITY_PAINTS = Object.freeze({
  border: (text) => text,
  title: (text) => text,
  bg: (text) => text,
});

function defaultMeasure(text) {
  return String(text ?? '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .length;
}

function plainText(text) {
  return String(text ?? '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '');
}

function leadingOsc(text) {
  const match = String(text ?? '').match(/^(?:\x1b\][^\x07]*(?:\x07|\x1b\\))+/);
  return match ? match[0] : '';
}

function fitLine(text, max, measure, truncate) {
  const src = String(text ?? '');
  if (measure(src) <= max) return src;
  if (typeof truncate === 'function') return truncate(src, max, '');
  let take = Math.min(src.length, max);
  while (take > 0 && measure(src.slice(0, take)) > max) take -= 1;
  return src.slice(0, Math.max(0, take));
}

function paintsOf(paints) {
  if (paints && typeof paints.border === 'function') return paints;
  return IDENTITY_PAINTS;
}

export function bubbleMetrics(terminalWidth, side = 'left') {
  const width = Math.max(1, Math.trunc(Number(terminalWidth)) || 80);
  const limit = Math.max(8, width - 1);
  const frame = Math.min(Math.max(12, Math.floor(width * 0.7)), limit);
  const pad = side === 'right' ? Math.max(0, limit - frame) : 0;
  const contentWidth = Math.max(1, frame - 4);
  return {
    width,
    frame,
    inner: side === 'right' ? frame : contentWidth,
    pad,
    insetX: side === 'left' ? 2 : 0,
    insetY: side === 'left' ? 2 : 0,
    trailing: 1,
    contentWidth: side === 'right' ? frame : contentWidth,
  };
}

function panelTop(frame, label, paints, measure, truncate) {
  const inner = Math.max(1, frame - 2);
  const title = fitLine(` ${label} `, inner, measure, truncate);
  const fill = '─'.repeat(Math.max(0, inner - measure(title)));
  return paints.bg(`${paints.border('╭')}${paints.title(title)}${paints.border(`${fill}╮`)}`);
}

function panelBottom(frame, paints) {
  const inner = Math.max(1, frame - 2);
  return paints.bg(paints.border(`╰${'─'.repeat(inner)}╯`));
}

function panelRow(line, frame, paints, measure, truncate) {
  const room = Math.max(1, frame - 4);
  const fitted = fitLine(line, room, measure, truncate);
  const gap = ' '.repeat(Math.max(0, room - measure(fitted)));
  return paints.bg(`${paints.border('│')} ${fitted}${gap} ${paints.border('│')}`);
}

function agentPanel(lines, frame, paints, measure, truncate) {
  const body = ['', ...lines, ''].map((line) => panelRow(line, frame, paints, measure, truncate));
  return [panelTop(frame, 'pi', paints, measure, truncate), ...body, panelBottom(frame, paints)];
}

function restyleUserLine(line, frame, paints, measure, truncate) {
  const osc = leadingOsc(line);
  const plain = plainText(line);
  if (plain.includes('╭')) return `${osc}${panelTop(frame, (plain.match(/╭\s*(\S+)/) || [])[1] || 'user', paints, measure, truncate)}`;
  if (plain.includes('╰')) return `${osc}${panelBottom(frame, paints)}`;
  if (plain.includes('│')) return `${osc}${String(line).slice(osc.length).replaceAll('│', paints.border('│'))}`;
  return line;
}

export function placeBubble(lines, terminalWidth, side = 'left', paints, measure = defaultMeasure, truncate) {
  const style = paintsOf(paints);
  const metrics = bubbleMetrics(terminalWidth, side);
  const body = Array.isArray(lines) ? lines : [];
  if (!body.length) return [];
  const left = ' '.repeat(metrics.pad);
  const rows = side === 'right' && body.some((line) => plainText(line).includes('╭'))
    ? body.map((line) => restyleUserLine(line, metrics.frame, style, measure, truncate))
    : side === 'left'
      ? agentPanel(body, metrics.frame, style, measure, truncate)
      : body.map((line) => String(line ?? ''));
  return [...rows.map((line) => `${left}${line}`), MESSAGE_GAP];
}

export function bubbleHit(metrics, event) {
  const x = Number(event?.x);
  const y = Number(event?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const trailing = metrics.trailing || 0;
  const height = Math.max(0, Number(event?.height) || 0);
  if (height > 0 && y >= height - trailing) return null;
  const contentX = x - metrics.pad - (metrics.insetX || 0);
  const contentY = y - (metrics.insetY || 0);
  if (contentX < 0 || contentY < 0 || contentX >= metrics.contentWidth) return null;
  return { x: contentX, y: contentY, width: metrics.contentWidth, height: Math.max(0, height - trailing) };
}

export function installMessageBubble(component, side, paints, tools = {}) {
  if (!component || component.__pi1cBubble) return false;
  if (side !== 'left' && side !== 'right') return false;
  if (typeof component.render !== 'function') return false;
  const measure = typeof tools.visibleWidth === 'function' ? tools.visibleWidth : defaultMeasure;
  const truncate = typeof tools.truncateToWidth === 'function' ? tools.truncateToWidth : undefined;
  const originalRender = component.render.bind(component);
  const originalMouse = typeof component.handleMouse === 'function' ? component.handleMouse.bind(component) : null;
  component.__pi1cBubble = true;
  component.render = (width) => {
    const metrics = bubbleMetrics(width, side);
    const lines = originalRender(metrics.inner);
    component.__pi1cBubbleBox = metrics;
    if (!Array.isArray(lines) || lines.length === 0) return Array.isArray(lines) ? lines : [];
    return placeBubble(lines, width, side, paints, measure, truncate);
  };
  if (originalMouse) {
    component.handleMouse = (event) => {
      const metrics = bubbleMetrics(event?.width ?? component.__pi1cBubbleBox?.width, side);
      const hit = bubbleHit(metrics, event);
      if (!hit) return undefined;
      return originalMouse({ ...event, x: hit.x, y: hit.y, width: hit.width, height: hit.height });
    };
  }
  return true;
}

export function alignChatTree(root, paints, tools) {
  let wrapped = 0;
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const side = SIDES[node.constructor?.name];
    if (side && installMessageBubble(node, side, paints, tools)) wrapped += 1;
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
    if (node.layoutRoot && node.layoutRoot !== node) walk(node.layoutRoot);
  };
  walk(root);
  return wrapped;
}
