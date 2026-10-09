import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandSections, sectionForCommand } from '../lib/ui/command-groups.mjs';

test('commands land in four sections and builtins are not duplicated', () => {
  const sections = buildCommandSections([
    { name: 'doctor', description: 'Health', source: 'extension' },
    { name: 'model', description: 'override', source: 'extension' },
    { name: 'ext-plan', description: 'Plan', source: 'prompt' },
    { name: 'skill:reglog', description: 'Log', source: 'skill' },
  ]);
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
  assert.deepEqual(sections.map((section) => section.label), ['Команды Pi', 'Команды профиля', 'Навыки', 'Готовые задания']);
  assert.equal(byId.profile.commands.some((item) => item.name === 'doctor'), true);
  assert.equal(byId.profile.commands.some((item) => item.name === 'model'), false);
  assert.equal(byId.pi.commands.filter((item) => item.name === 'model').length, 1);
  assert.equal(byId.prompts.commands[0].name, 'ext-plan');
  assert.equal(byId.skills.commands[0].name, 'skill:reglog');
  assert.equal(sectionForCommand({ name: 'layout-view', source: 'extension' }), 'profile');
});
