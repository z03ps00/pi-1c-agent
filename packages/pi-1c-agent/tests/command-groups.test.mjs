import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandSections, filterCommandSections, groupSelectionResult, sectionForCommand, submitFocusedEditor } from '../lib/ui/command-groups.mjs';

test('commands land in themed sections and builtins are not duplicated', () => {
  const samples = [
    ['layout-view', 'extension', 'onec'],
    ['loadfrom1cbase', 'prompt', 'onec'],
    ['cursor-cloud', 'extension', 'cursor'],
    ['mcp', 'extension', 'mcp'],
    ['installtools', 'prompt', 'mcp'],
    ['anon', 'extension', 'settings'],
    ['mode', 'extension', 'agents'],
    ['bugfix', 'prompt', 'agents'],
    ['learn', 'extension', 'knowledge'],
    ['init-knowledge', 'prompt', 'knowledge'],
    ['wrap', 'extension', 'sessions'],
    ['doctor', 'extension', 'profile'],
    ['update-profile', 'prompt', 'profile'],
    ['mystery', 'extension', 'profile'],
    ['skill:reglog', 'skill', 'skills'],
    ['resume', 'prompt', 'pi'],
    ['model', 'extension', 'pi'],
  ];
  for (const [name, source, section] of samples) {
    assert.equal(sectionForCommand({ name, source }), section, name);
  }
  const sections = buildCommandSections([
    { name: 'doctor', description: 'Health', source: 'extension' },
    { name: 'model', description: 'override', source: 'extension' },
    { name: 'ext-plan', description: 'Plan', source: 'prompt' },
    { name: 'loadfrom1cbase', description: 'Dump', source: 'prompt' },
    { name: 'skill:reglog', description: 'Log', source: 'skill' },
    { name: 'mystery', description: 'New', source: 'extension' },
    { name: 'resume', description: 'Task resume', source: 'prompt' },
  ]);
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]));
  assert.deepEqual(sections.map((section) => section.label), ['Команды Pi', 'Команды 1С', 'Профиль', 'Навыки']);
  assert.equal(byId.profile.commands.some((item) => item.name === 'doctor'), true);
  assert.equal(byId.profile.commands.some((item) => item.name === 'mystery'), true);
  assert.equal(byId.profile.commands.some((item) => item.name === 'model'), false);
  assert.equal(byId.pi.commands.filter((item) => item.name === 'model').length, 1);
  assert.equal(byId.pi.commands.filter((item) => item.name === 'resume').length, 1);
  assert.deepEqual(byId.onec.commands.map((item) => item.name), ['ext-plan', 'loadfrom1cbase']);
  assert.equal(byId.skills.commands[0].name, 'skill:reglog');
  assert.equal(sections.some((section) => section.id === 'cursor'), false);
  const themed = buildCommandSections(samples.map(([name, source]) => ({ name, source, description: name })));
  assert.deepEqual(themed.map((section) => section.label), [
    'Команды Pi',
    'Команды 1С',
    'Cursor',
    'MCP и интеграции',
    'Настройки',
    'Агенты',
    'Знания',
    'Сессии и память',
    'Профиль',
    'Навыки',
  ]);
});

test('third-party command labels are Russian and profile wording stays', () => {
  const sections = buildCommandSections([
    { name: 'cursor-cloud', description: 'List, archive, or delete recorded Cursor cloud agents for this session branch', source: 'extension' },
    { name: 'mcp', description: 'Show MCP server status', source: 'extension' },
    { name: 'doctor', description: 'Проверка профиля и пакета без модели', source: 'extension' },
  ]);
  const description = (id, name) => sections.find((section) => section.id === id)
    .commands.find((item) => item.name === name).description;
  assert.equal(description('cursor', 'cursor-cloud'), 'Список, архив или удаление облачных агентов Cursor этой ветки');
  assert.equal(description('mcp', 'mcp'), 'Статус серверов MCP');
  assert.equal(description('profile', 'doctor'), 'Проверка профиля и пакета без модели');
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
