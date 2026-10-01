import { visibleWidth } from './theme.mjs';

/** Word-wrap. A word longer than the column is split, never replaced with an ellipsis. */
export function wrapPlain(text, width) {
  const limit = Math.max(1, width);
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return [];
  const lines = [];
  let current = '';

  function takeOverflow(word) {
    let rest = word;
    while (visibleWidth(rest) > limit) {
      let take = Math.min(limit, rest.length);
      while (take > 1 && visibleWidth(rest.slice(0, take)) > limit) take -= 1;
      lines.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
    return rest;
  }

  for (const word of src.split(' ')) {
    if (!current) {
      current = visibleWidth(word) > limit ? takeOverflow(word) : word;
      continue;
    }
    const next = `${current} ${word}`;
    if (visibleWidth(next) <= limit) current = next;
    else {
      lines.push(current);
      current = visibleWidth(word) > limit ? takeOverflow(word) : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function padEndVisible(text, width) {
  const gap = Math.max(0, width - visibleWidth(text));
  return `${text}${' '.repeat(gap)}`;
}

export function measurePicker(items, width) {
  const widest = (items || []).reduce((n, item) => Math.max(n, visibleWidth(item?.label ?? item?.value ?? '')), 4);
  const prefix = 2;
  const gap = 2;
  const minDesc = 12;
  let labelCol = widest;
  if (prefix + labelCol + gap + minDesc > width) {
    labelCol = Math.max(4, width - prefix - gap - minDesc);
  }
  const descWidth = Math.max(1, width - prefix - labelCol - gap);
  return { prefix, gap, labelCol, descWidth };
}

function clipLabel(label, labelCol) {
  const text = String(label ?? '');
  if (visibleWidth(text) <= labelCol) return text;
  let take = Math.min(labelCol, text.length);
  while (take > 1 && visibleWidth(text.slice(0, take)) > labelCol) take -= 1;
  return text.slice(0, take);
}

export function pickerItemLines(item, layout, selected) {
  const label = clipLabel(item?.label ?? item?.value ?? '', layout.labelCol);
  const descLines = wrapPlain(item?.description || '', layout.descWidth);
  const mark = selected ? '→ ' : '  ';
  const padded = padEndVisible(label, layout.labelCol);
  const lines = [];
  if (!descLines.length) {
    lines.push(`${mark}${padded}`.trimEnd());
    return lines;
  }
  lines.push(`${mark}${padded}${' '.repeat(layout.gap)}${descLines[0]}`);
  const indent = ' '.repeat(layout.prefix + layout.labelCol + layout.gap);
  for (const extra of descLines.slice(1)) lines.push(`${indent}${extra}`);
  return lines;
}

/**
 * Intro on top, then one block per visible choice: label column and a wrapped description column.
 * @returns {{ lines: string[], spans: { index: number, from: number, to: number }[], start: number, end: number }}
 */
export function composePickerLines({ intro, items, selectedIndex = 0, width, maxLines = 22 } = {}) {
  const safeWidth = Math.max(20, Number(width) || 20);
  const list = Array.isArray(items) ? items : [];
  const selected = Math.max(0, Math.min(selectedIndex, Math.max(0, list.length - 1)));
  const header = wrapPlain(intro || '', safeWidth);
  if (header.length) header.push('');
  const layout = measurePicker(list, safeWidth);
  const blocks = list.map((item, index) => pickerItemLines(item, layout, index === selected));
  const counts = blocks.map((block) => block.length);
  const budget = Math.max(1, maxLines - header.length);
  let start = 0;
  if (counts.length && counts.reduce((sum, n) => sum + n, 0) > budget) {
    start = Math.min(selected, counts.length - 1);
    let used = counts[start] || 0;
    while (start > 0 && used + counts[start - 1] <= budget) {
      start -= 1;
      used += counts[start];
    }
  }
  let end = start;
  let used = 0;
  while (end < counts.length && (used + counts[end] <= budget || end === start)) {
    used += counts[end];
    end += 1;
  }
  const lines = [...header];
  const spans = [];
  for (let index = start; index < end; index += 1) {
    const from = lines.length;
    lines.push(...blocks[index]);
    spans.push({ index, from, to: lines.length });
  }
  if (start > 0 || end < counts.length) lines.push(`  ${selected + 1}/${counts.length}`);
  return { lines, spans, start, end };
}

export function pickerSpanAt(spans, lineIndex) {
  return (spans || []).find((span) => lineIndex >= span.from && lineIndex < span.to) || null;
}
