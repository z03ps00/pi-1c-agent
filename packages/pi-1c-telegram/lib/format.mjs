import { sanitizeForEgress } from '../../pi-1c-agent/lib/redact.mjs';

export const TELEGRAM_TEXT_LIMIT = 4000;

export function redactOutgoing(text, cwd) {
  return sanitizeForEgress(String(text ?? ''), { cwd });
}

export function formatTurn({ answer = '', thought = '' } = {}) {
  const blocks = [];
  const thinking = String(thought || '').trim();
  const body = String(answer || '').trim();
  if (thinking) blocks.push(`Рассуждение:\n${thinking}`);
  if (body) blocks.push(body);
  return blocks;
}

export function chunkText(text, limit = TELEGRAM_TEXT_LIMIT) {
  const value = String(text ?? '');
  if (!value) return [];
  if (value.length <= limit) return [value];
  const chunks = [];
  for (let index = 0; index < value.length; index += limit) chunks.push(value.slice(index, index + limit));
  return chunks;
}

export function pageSlice(items, page, size = 6) {
  const list = Array.isArray(items) ? items : [];
  const pages = Math.max(1, Math.ceil(list.length / size) || 1);
  const current = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  const start = current * size;
  return { page: current, pages, items: list.slice(start, start + size), start };
}
