import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandSections, filterCommandSections, groupSelectionResult, sectionForCommand, submitFocusedEditor } from '../lib/ui/command-groups.mjs';

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

test('third-party command labels are Russian and profile wording stays', () => {
  const sections = buildCommandSections([
    { name: 'cursor-cloud', description: 'List, archive, or delete recorded Cursor cloud agents for this session branch', source: 'extension' },
    { name: 'mcp', description: 'Show MCP server status', source: 'extension' },
    { name: 'doctor', description: 'Проверка профиля и пакета без модели', source: 'extension' },
  ]);
  const profile = sections.find((section) => section.id === 'profile');
  const byName = Object.fromEntries(profile.commands.map((item) => [item.name, item.description]));
  assert.equal(byName['cursor-cloud'], 'Список, архив или удаление облачных агентов Cursor этой ветки');
  assert.equal(byName.mcp, 'Статус серверов MCP');
  assert.equal(byName.doctor, 'Проверка профиля и пакета без модели');
});

test('mode and learning from the groups list open their pickers', () => {
  const known = new Set(['command:mode', 'command:learning', 'command:learn', 'command:evolve', 'command:approve', 'command:theme']);
  assert.deepEqual(groupSelectionResult('mode', known), { kind: 'picker', actionId: 'command:mode', command: 'mode' });
  assert.deepEqual(groupSelectionResult('learning', known), { kind: 'picker', actionId: 'command:learning', command: 'learning' });
  assert.deepEqual(groupSelectionResult('learn', known), { kind: 'picker', actionId: 'command:learn', command: 'learn' });
  assert.deepEqual(groupSelectionResult('evolve', known), { kind: 'picker', actionId: 'command:evolve', command: 'evolve' });
  assert.equal(groupSelectionResult('approve', known).kind, 'picker');
  assert.equal(groupSelectionResult('theme', known).kind, 'picker');
  assert.deepEqual(groupSelectionResult('doctor', known), { kind: 'run', command: 'doctor', text: '/doctor' });
  assert.deepEqual(groupSelectionResult('mcp', known), { kind: 'run', command: 'mcp', text: '/mcp' });
  assert.equal(groupSelectionResult('mode', new Set()).kind, 'run');
  assert.equal(groupSelectionResult('', known).kind, 'cancel');
});

test('typed query filters commands and an empty query keeps them', () => {
  const sections = buildCommandSections([
    { name: 'doctor', description: 'Проверка профиля', source: 'extension' },
    { name: 'model', description: 'override', source: 'extension' },
  ]);
  const total = sections.reduce((sum, section) => sum + section.commands.length, 0);
  assert.equal(filterCommandSections(sections, '').length, total);
  assert.equal(filterCommandSections(sections, '   ').length, total);
  assert.equal(filterCommandSections(sections, 'doc')[0].name, 'doctor');
  assert.equal(filterCommandSections(sections, '/Model')[0].name, 'model');
  assert.equal(filterCommandSections(sections, 'проверк')[0].name, 'doctor');
  assert.equal(filterCommandSections(sections, 'нет-такой').length, 0);
});

test('choosing a command submits it through the focused editor', () => {
  const editor = {
    text: '',
    keys: [],
    setText(value) { this.text = value; },
    handleInput(data) { this.keys.push(data); },
  };
  const tui = { getFocusedComponent: () => editor };
  assert.equal(submitFocusedEditor(tui, '/mcp'), true);
  assert.equal(editor.text, '/mcp');
  assert.deepEqual(editor.keys, ['\r']);
  assert.equal(submitFocusedEditor(tui, 'mcp'), false);
  assert.equal(submitFocusedEditor({}, '/settings'), false);
});
