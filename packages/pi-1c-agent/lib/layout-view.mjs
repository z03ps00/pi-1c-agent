import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 800;
const MAX_DEPTH = 32;
const MAX_ROWS = 200;
const MAX_COLS = 40;

const FORM_TAGS = new Set([
  'usualgroup', 'pages', 'page', 'inputfield', 'checkboxfield', 'labelfield',
  'button', 'table', 'commandbar', 'picturefield', 'radiobuttonfield',
  'spreadsheetdocumentfield', 'childitems',
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function localName(tag) {
  const bare = String(tag || '').split(':').pop() || '';
  return bare.toLowerCase();
}

function attr(raw, key) {
  const re = new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`, 'i');
  const match = String(raw || '').match(re);
  return match ? match[1] : '';
}

function parseNodes(xml) {
  const parts = String(xml || '').split(/(<[^>]+>)/);
  const root = { tag: 'root', name: '', title: '', children: [] };
  const stack = [root];
  let nodes = 0;
  for (const part of parts) {
    if (!part) continue;
    if (!part.startsWith('<')) {
      const text = part.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const current = stack[stack.length - 1];
      if (current && localName(current.tag) === 'content' && !current.title) current.title = text.slice(0, 180);
      continue;
    }
    if (part.startsWith('<?') || part.startsWith('<!')) continue;
    const close = /^<\/\s*([A-Za-z0-9_:-]+)/.exec(part);
    if (close) {
      const name = localName(close[1]);
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (localName(stack[i].tag) === name) {
          stack.splice(i);
          break;
        }
      }
      continue;
    }
    const open = /^<\s*([A-Za-z0-9_:-]+)([^>]*)>/.exec(part);
    if (!open) continue;
    if (nodes >= MAX_NODES) continue;
    if (stack.length >= MAX_DEPTH) continue;
    nodes += 1;
    const node = {
      tag: open[1],
      name: attr(open[2], 'name'),
      title: '',
      children: [],
    };
    stack[stack.length - 1].children.push(node);
    if (!part.endsWith('/>')) stack.push(node);
  }
  return root;
}

function bubbleTitle(node) {
  if (node.title) return node.title;
  for (const child of node.children || []) {
    const found = bubbleTitle(child);
    if (found && localName(child.tag) === 'content') return found;
    if (found && localName(node.tag) === 'title') return found;
  }
  for (const child of node.children || []) {
    if (localName(child.tag) === 'title') {
      const found = bubbleTitle(child);
      if (found) return found;
    }
  }
  return '';
}

function interesting(node) {
  return FORM_TAGS.has(localName(node.tag));
}

function renderNode(node) {
  const title = bubbleTitle(node);
  const bits = [];
  if (interesting(node)) {
    const kind = localName(node.tag);
    const label = title || node.name || kind;
    bits.push(`<div class="item ${escapeHtml(kind)}"><span class="kind">${escapeHtml(kind)}</span> ${escapeHtml(label)}</div>`);
  }
  for (const child of node.children || []) bits.push(renderNode(child));
  return bits.filter(Boolean).join('\n');
}

function cellText(chunk) {
  const parameter = chunk.match(/<parameter>([^<]*)<\/parameter>/i);
  if (parameter) return `[${parameter[1].trim()}]`;
  const content = chunk.match(/<v8:content>([^<]*)<\/v8:content>/i);
  if (content) return content[1].trim();
  return '';
}

function renderSheet(xml) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) && rows.length < MAX_ROWS) {
    const cells = [];
    const cellRe = /<c\b[^>]*>([\s\S]*?)<\/c>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1])) && cells.length < MAX_COLS) {
      cells.push(cellText(cellMatch[1]));
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  if (!rows.length) return '<p>В макете нет текстовых ячеек.</p>';
  const body = rows.map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<table>${body}</table>`;
}

export function renderLayoutHtml(xml) {
  const source = String(xml ?? '');
  if (source.includes('\0')) throw new Error('binary layout is not supported');
  if (Buffer.byteLength(source) > MAX_BYTES) throw new Error('layout is larger than 4 MiB');
  const sheet = /<spreadsheetDocument\b|<rowsItem\b/i.test(source);
  const form = /<Form[\s>]|<ChildItems\b/i.test(source);
  if (!sheet && !form) throw new Error('unsupported layout file');
  const body = sheet ? renderSheet(source) : renderNode(parseNodes(source));
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>layout</title>
<style>
body { font: 14px sans-serif; margin: 16px; }
.item { margin: 4px 0 4px 12px; }
.kind { color: #666; }
table { border-collapse: collapse; }
td { border: 1px solid #ccc; padding: 4px 8px; }
</style>
</head>
<body>
${body || '<p>Пустая схема.</p>'}
</body>
</html>
`;
  if (/<script[\s>]/i.test(html)) throw new Error('refusing html with script');
  return html;
}

export function resolveInsideProject(cwd, userPath) {
  const root = fs.realpathSync(path.resolve(cwd));
  const requested = path.resolve(root, String(userPath || ''));
  if (!fs.existsSync(requested)) throw new Error(`file not found: ${userPath}`);
  const real = fs.realpathSync(requested);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new Error('path leaves the project');
  return real;
}

export function writeLayoutPreview(cwd, userPath) {
  const source = resolveInsideProject(cwd, userPath);
  const lower = source.toLowerCase();
  if (lower.endsWith('.bin') || lower.endsWith('.mxl')) throw new Error('binary layout is not supported');
  const xml = fs.readFileSync(source);
  if (xml.includes(0)) throw new Error('binary layout is not supported');
  const html = renderLayoutHtml(xml.toString('utf8'));
  const outDir = path.join(path.resolve(cwd), '.pi', 'previews');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(source).replace(/[^\w.\-а-яё]+/gi, '_').slice(0, 80) || 'layout';
  const dest = path.join(outDir, `${base}.html`);
  const destRealParent = fs.realpathSync(path.resolve(cwd));
  const destResolved = path.resolve(dest);
  if (!destResolved.startsWith(`${destRealParent}${path.sep}`)) throw new Error('preview path leaves the project');
  fs.writeFileSync(dest, html, 'utf8');
  return dest;
}
