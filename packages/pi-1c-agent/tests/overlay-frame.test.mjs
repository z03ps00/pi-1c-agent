import test from 'node:test';
import assert from 'node:assert/strict';
import { composeFrame } from '../lib/ui/overlay-frame.mjs';
import { visibleWidth } from '../lib/ui/theme.mjs';

function painted(parts) {
  return [
    parts.top,
    ...parts.lines.map((line) => `│${line.content}│`),
    parts.bottom,
  ];
}

test('frame corners share one column, the hint sits inside, and each row is width - 1', () => {
  const width = 48;
  const parts = composeFrame({
    title: 'Разделы',
    body: ['Команды Pi', '→ Команды профиля'],
    width,
    footer: 'Esc — закрыть',
  });
  const lines = painted(parts);
  assert.equal(parts.outer, width - 1);
  assert.equal(parts.top.startsWith('╭'), true);
  assert.equal(parts.top.endsWith('╮'), true);
  assert.equal(parts.bottom.startsWith('╰'), true);
  assert.equal(parts.bottom.endsWith('╯'), true);
  for (const line of lines) assert.equal(visibleWidth(line), width - 1);
  assert.equal(parts.lines.at(-2).kind, 'gap');
  assert.equal(parts.lines.at(-2).content.trim(), '');
  assert.equal(parts.lines.at(-1).kind, 'footer');
  assert.match(parts.lines.at(-1).content, /Esc — закрыть/);
  assert.match(parts.lines[0].content, /^ {2}/);
  assert.match(parts.top, /Разделы/);
});

test('a colored row stays inside the frame', () => {
  const width = 30;
  const colored = `\x1b[31m${'x'.repeat(80)}\x1b[0m`;
  const parts = composeFrame({ title: 'T', body: [colored], width, footer: 'ok' });
  for (const line of painted(parts)) assert.equal(visibleWidth(line), width - 1);
});
