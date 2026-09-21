import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVE_MAX_LEVEL,
  approvalScope,
  approveLevelName,
  classifyDanger,
  classifyReadOnlyShell,
  cycleApproveLevel,
  dangerousBashReason,
  describeApprove,
  isIbMutatingName,
  normalizeApproveLevel,
  parseApproveLevel,
  shouldPrompt,
} from '../lib/approve-policy.mjs';
import { sanitizeModeState, initialModeState } from '../lib/plan-state.mjs';

test('approve helpers parse, cycle and name levels', () => {
  assert.equal(APPROVE_MAX_LEVEL, 2);
  assert.equal(normalizeApproveLevel(1), 1);
  assert.equal(normalizeApproveLevel('strict'), 2);
  assert.equal(normalizeApproveLevel('safe'), 1);
  assert.equal(normalizeApproveLevel('off'), 0);
  assert.equal(normalizeApproveLevel('9'), 0);
  assert.equal(normalizeApproveLevel('nope'), 0);
  assert.deepEqual(parseApproveLevel(''), { kind: 'pick' });
  assert.deepEqual(parseApproveLevel('status'), { kind: 'status' });
  assert.deepEqual(parseApproveLevel('off'), { kind: 'set', level: 0 });
  assert.deepEqual(parseApproveLevel('safe'), { kind: 'set', level: 1 });
  assert.deepEqual(parseApproveLevel('1'), { kind: 'set', level: 1 });
  assert.deepEqual(parseApproveLevel('strict'), { kind: 'set', level: 2 });
  assert.deepEqual(parseApproveLevel('2'), { kind: 'set', level: 2 });
  assert.equal(parseApproveLevel('xyz').kind, 'invalid');
  assert.equal(cycleApproveLevel(0), 1);
  assert.equal(cycleApproveLevel(1), 2);
  assert.equal(cycleApproveLevel(2), 0);
  assert.equal(approveLevelName(0), 'off');
  assert.equal(approveLevelName(1), 'safe');
  assert.equal(approveLevelName(2), 'strict');
  assert.match(describeApprove(1), /non-read-only shell/);
  assert.match(describeApprove(2), /every tool/);
});

test('shouldPrompt is off / safe-dangerous / strict-always', () => {
  assert.equal(shouldPrompt(0, true), false);
  assert.equal(shouldPrompt(0, false), false);
  assert.equal(shouldPrompt(1, true), true);
  assert.equal(shouldPrompt(1, false), false);
  assert.equal(shouldPrompt('safe', true), true);
  assert.equal(shouldPrompt(2, false), true);
  assert.equal(shouldPrompt('strict', false), true);
});

test('classifyDanger treats writes and edits as dangerous', () => {
  const write = classifyDanger('write', { path: 'src/foo.bsl' });
  assert.equal(write.dangerous, true);
  assert.equal(write.category, 'file_write');
  const edit = classifyDanger('edit', { path: 'src/foo.bsl' });
  assert.equal(edit.dangerous, true);
  assert.equal(edit.category, 'file_write');
});

test('classifyDanger flags destructive bash and leaves git status alone', () => {
  const cases = [
    ['rm -rf /tmp/x', 'rm -rf'],
    ['sudo rm -fr ./build', 'rm -rf'],
    ['git push origin main', 'git push'],
    ['git push --force', 'git push'],
    ['git reset --hard HEAD', 'git reset --hard'],
    ['git clean -fd', 'git clean -fd'],
    ['git clean -fdx', 'git clean -fd'],
    ['git checkout -- src/foo.bsl', 'git checkout --'],
    ['docker ps', 'docker'],
    ['podman compose up -d', 'docker'],
    ['ibcmd infobase load --data dump.dt', '.dt'],
    ['load Configuration.cf', '.cf'],
    ['ЗагрузитьИнформационнуюБазу', 'ЗагрузитьИнформационнуюБазу'],
    ['публикация базы', 'publication'],
  ];
  for (const [command, needle] of cases) {
    const result = classifyDanger('bash', { command });
    assert.equal(result.dangerous, true, command);
    assert.equal(result.category, 'bash', command);
    assert.match(result.reason, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), command);
  }
  assert.equal(classifyDanger('bash', { command: 'git status' }).dangerous, false);
  assert.equal(classifyDanger('bash', { command: 'grep docker README.md' }).dangerous, false);
  assert.equal(classifyDanger('bash', { command: 'rm file.txt' }).dangerous, true);
  assert.equal(dangerousBashReason('git status'), null);
  const ps = classifyDanger('powershell', { command: 'git reset --hard' });
  assert.equal(ps.dangerous, true);
});

test('safe shell is allowlist-only and treats equivalents as dangerous', () => {
  const dangerous = [
    'rm --recursive --force /tmp/x',
    'git restore .',
    'find . -delete',
    'truncate -s 0 data.db',
    'python -c "import os; os.remove(\'x\')"',
    'node -e "fs.unlinkSync(\'x\')"',
    'dd if=/dev/null of=x',
    'rm file.txt',
  ];
  for (const command of dangerous) {
    const result = classifyDanger('bash', { command });
    assert.equal(result.dangerous, true, command);
    assert.equal(classifyReadOnlyShell(command).allowed, false, command);
  }
  assert.equal(classifyReadOnlyShell('git status').allowed, true);
  assert.equal(classifyReadOnlyShell('ls -la').allowed, true);
  assert.equal(classifyReadOnlyShell('git status; rm -rf x').allowed, false);
});

test('approvalScope is narrower than the mutation category', () => {
  const push = classifyDanger('bash', { command: 'git push origin main' });
  const restore = classifyDanger('bash', { command: 'git restore .' });
  const write = classifyDanger('write', { path: 'src/foo.bsl' });
  const otherWrite = classifyDanger('write', { path: 'src/bar.bsl' });
  assert.notEqual(
    approvalScope('bash', push, { command: 'git push origin main' }),
    approvalScope('bash', restore, { command: 'git restore .' }),
  );
  assert.notEqual(
    approvalScope('write', write, { path: 'src/foo.bsl' }),
    approvalScope('write', otherWrite, { path: 'src/bar.bsl' }),
  );
  assert.match(approvalScope('bash', push, { command: 'git push origin main' }), /bash:bash:git push/);
});

test('classifyDanger MCP read vs mutation and live IB tools', () => {
  const search = classifyDanger('mcp', { server: 'knowledge', tool: 'search' });
  assert.equal(search.dangerous, false);
  const recall = classifyDanger('mcp', { server: 'memory', tool: 'recall' });
  assert.equal(recall.dangerous, false);
  const remember = classifyDanger('mcp', { server: 'memory', tool: 'remember' });
  assert.equal(remember.dangerous, true);
  assert.equal(remember.category, 'mcp_mutation');
  const writeKnow = classifyDanger('mcp', { server: 'knowledge', tool: 'write' });
  assert.equal(writeKnow.dangerous, true);
  const docs = classifyDanger('mcp', { server: '1c-docs-mcp', tool: 'docsearch' });
  assert.equal(docs.dangerous, false);
  const ib = classifyDanger('mcp', { server: '1c-data-mcp', tool: 'vcexecutecode' });
  assert.equal(ib.dangerous, true);
  assert.equal(ib.category, 'ib_mutation');
  const query = classifyDanger('mcp', { server: '1c-data-mcp', tool: 'execute_query' });
  assert.equal(query.dangerous, true);
  assert.equal(query.category, 'ib_mutation');
  assert.equal(classifyDanger('mcp', {}).dangerous, false);
  assert.equal(classifyDanger('mcpScript', {}).dangerous, true);
  assert.equal(isIbMutatingName('vcexecutequery'), true);
  assert.equal(classifyDanger('vcexecutecode', {}).dangerous, true);
  assert.equal(classifyDanger('vcexecutecode', {}).category, 'ib_mutation');
});

test('classifyDanger treats read-only native tools as safe', () => {
  for (const name of ['read', 'grep', 'find', 'ls', 'knowledge_1c', 'syntaxcheck']) {
    const result = classifyDanger(name, { path: 'src/foo.bsl' });
    assert.equal(result.dangerous, false, name);
  }
});

test('sanitizeModeState keeps and normalizes approveLevel', () => {
  const fresh = initialModeState();
  assert.equal(fresh.approveLevel, 0);
  const kept = sanitizeModeState({
    mode: 'build',
    phase: 'build-idle',
    plan: null,
    anonLevel: 0,
    approveLevel: 2,
  });
  assert.equal(kept.approveLevel, 2);
  const named = sanitizeModeState({
    mode: 'build',
    phase: 'build-idle',
    plan: null,
    approveLevel: 'safe',
  });
  assert.equal(named.approveLevel, 1);
  const garbage = sanitizeModeState({
    mode: 'ask',
    phase: 'ask-idle',
    plan: null,
    approveLevel: 'yes-please',
  });
  assert.equal(garbage.approveLevel, 0);
});
