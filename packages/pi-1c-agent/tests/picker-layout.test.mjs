import test from 'node:test';
import assert from 'node:assert/strict';
import { composePickerLines, pickerSpanAt } from '../lib/ui/picker-layout.mjs';
import { LITEMODE_CHOICES, LITEMODE_INTRO, SDLC_CHOICES, SDLC_INTRO } from '../lib/project-settings.mjs';

test('picker puts the intro above a two-column choice and keeps the wrapped description', () => {
  const view = composePickerLines({
    intro: SDLC_INTRO,
    items: SDLC_CHOICES,
    selectedIndex: 0,
    width: 46,
    maxLines: 24,
  });
  const text = view.lines.join('\n');
  assert.match(view.lines[0], /Глубина проверок/);
  assert.match(text, /→ lite/);
  assert.match(text, /меньше проверок на мелкой правке/);
  assert.match(text, /полный бюджет повторов/);
  assert.equal(text.includes('…'), false);
  const full = view.lines.filter((line) => line.includes('full') || line.trimStart().startsWith('все') || line.includes('повторов'));
  const rebuilt = full.map((line) => line.replace(/^.*full\s+/, '').replace(/^\s+/, '')).join(' ');
  assert.match(rebuilt, /все три статические проверки и полный бюджет повторов/);
  const lite = view.spans.find((span) => view.lines[span.from].includes('→ lite'));
  assert.ok(lite);
  assert.equal(pickerSpanAt(view.spans, lite.from)?.index, 0);
  assert.equal(pickerSpanAt(view.spans, lite.to)?.index, 1);
});

test('litemode lite explains UI_TESTING=off and is not the sdlc lite line', () => {
  const view = composePickerLines({
    intro: LITEMODE_INTRO,
    items: LITEMODE_CHOICES,
    selectedIndex: 0,
    width: 64,
  });
  const text = view.lines.join('\n');
  assert.match(text, /выключает UI-тесты/);
  assert.match(text, /UI_TESTING=off/);
  assert.equal(SDLC_CHOICES[0].description.includes('UI_TESTING'), false);
});
