import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TASKMODE,
  TASKMODES,
  describeTaskmode,
  normalizeTaskmode,
  parseTaskmode,
  resetTaskmodeStateForTests,
  set1cTaskmode,
  current1cTaskmode,
  taskmodeChoices,
  taskmodeFooterLabel,
  taskmodeNote,
} from '../lib/taskmode-state.mjs';

test('normalizeTaskmode maps aliases and falls back to auto', () => {
  assert.equal(normalizeTaskmode('docs'), 'docs-fix');
  assert.equal(normalizeTaskmode('SPEC AUTHORING'), 'spec-authoring');
  assert.equal(normalizeTaskmode('quickfix'), 'quick-fix');
  assert.equal(normalizeTaskmode('off'), 'auto');
  assert.equal(normalizeTaskmode('nope'), DEFAULT_TASKMODE);
  assert.equal(normalizeTaskmode(''), DEFAULT_TASKMODE);
});

test('parseTaskmode: empty picks, status reports, known sets, unknown is invalid', () => {
  assert.deepEqual(parseTaskmode(''), { kind: 'pick' });
  assert.deepEqual(parseTaskmode('status'), { kind: 'status' });
  assert.deepEqual(parseTaskmode('docs-fix'), { kind: 'set', path: 'docs-fix' });
  assert.deepEqual(parseTaskmode('spec'), { kind: 'set', path: 'spec-authoring' });
  assert.equal(parseTaskmode('build').kind, 'invalid');
});

test('taskmode picker items cover every path', () => {
  const values = taskmodeChoices().map((c) => c.value);
  assert.deepEqual(values, [...TASKMODES]);
  assert.equal(taskmodeFooterLabel('spec-authoring'), 'spec');
  assert.equal(taskmodeFooterLabel('auto'), 'auto');
});

test('taskmodeNote is not /mode and keeps gates', () => {
  const pinned = taskmodeNote('docs-fix');
  assert.match(pinned, /DOCS-FIX/);
  assert.match(pinned, /not \/mode/);
  assert.match(pinned, /syntaxcheck/);
  assert.match(taskmodeNote('auto'), /AUTO/);
});

test('shared taskmode state defaults to auto', () => {
  resetTaskmodeStateForTests();
  assert.equal(current1cTaskmode(), 'auto');
  set1cTaskmode('full-cycle');
  assert.equal(current1cTaskmode(), 'full-cycle');
  assert.match(describeTaskmode('full-cycle'), /FULL-CYCLE/);
  resetTaskmodeStateForTests();
});
