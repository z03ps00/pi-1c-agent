import test from 'node:test';
import assert from 'node:assert/strict';
import { childModeGuardText, childToolAllowlist, classifySideEffects, evaluateSubagentRequest, isWriterAgent, parallelSafety, writerNames } from '../lib/agent-policy.mjs';
import { current1cMode, resetModeStateForTests, set1cMode } from '../lib/mode-state.mjs';

test('at most one writer may run in parallel', () => {
  assert.equal(parallelSafety([{agent:'1c-explorer'},{agent:'1c-analytic'}]).ok, true);
  assert.equal(parallelSafety([{agent:'1c-explorer'},{agent:'1c-code-reviewer'}]).ok, true);
  const bad = parallelSafety([{agent:'1c-developer'},{agent:'1c-tester'}]);
  assert.equal(bad.ok, false);
});

test('writer status derives from declared tools', () => {
  assert.equal(isWriterAgent({ name:'1c-explorer', tools:['read','grep','find'] }), false);
  assert.equal(isWriterAgent({ name:'1c-analytic', tools:['read','write','edit','bash'] }), true);
  const writers = writerNames([{ name:'1c-explorer', tools:['read'] }, { name:'1c-planner', tools:['read','write'] }]);
  assert.ok(writers.has('1c-planner'));
  assert.equal(writers.has('1c-explorer'), false);
});

test('MCP capability adds custom tools but never undeclared built-in mutators', () => {
  const allTools = ['read','write','edit','bash','grep','find','syntaxcheck','codesearch','mcp','subagent_1c','workflow_1c'];
  const readonly = childToolAllowlist({ mode:'build', agentTools:['read','grep','find'], capabilities:['mcp'], allTools });
  assert.ok(readonly.includes('syntaxcheck'));
  assert.ok(readonly.includes('codesearch'));
  assert.ok(readonly.includes('mcp'));
  assert.equal(readonly.includes('write'), false);
  assert.equal(readonly.includes('edit'), false);
  assert.equal(readonly.includes('bash'), false);
  const developer = childToolAllowlist({ mode:'build', agentTools:['read','write','edit','grep','find','bash'], capabilities:['mcp'], allTools });
  assert.ok(developer.includes('write'));
  assert.ok(developer.includes('bash'));
  assert.equal(developer.includes('subagent_1c'), false);
  assert.equal(developer.includes('workflow_1c'), false);
});

test('PLAN filters writer tools but keeps read-only MCP tools', () => {
  const tools = childToolAllowlist({ mode:'plan', agentTools:['read','write','bash'], capabilities:['mcp'], allTools:['read','write','bash','syntaxcheck','codesearch','subagent_1c','delete_database','mcp'] });
  assert.ok(tools.includes('syntaxcheck'));
  assert.ok(tools.includes('codesearch'));
  assert.ok(tools.includes('mcp'));
  assert.equal(tools.includes('write'), false);
  assert.equal(tools.includes('bash'), false);
  assert.equal(tools.includes('delete_database'), false);
});

test('ASK blocks writer subagents before spawn and keeps explorer', () => {
  resetModeStateForTests();
  set1cMode('ask');
  const mode = current1cMode();
  const developer = { name: '1c-developer', tools: ['read', 'write', 'edit', 'bash'], capabilities: ['mcp'] };
  const explorer = { name: '1c-explorer', tools: ['read', 'grep', 'find'], capabilities: ['mcp'], mcpReadOnly: true, sideEffects: ['mcp-read'] };
  assert.throws(() => evaluateSubagentRequest({ mode, agent: developer, allTools: developer.tools }), /ASK blocks writer\/execution subagent '1c-developer'/);
  const allowed = evaluateSubagentRequest({ mode, agent: explorer, allTools: explorer.tools });
  assert.equal(allowed.spawn, true);
  assert.match(allowed.modeGuard, /Parent 1C ASK mode/);
  assert.doesNotMatch(allowed.modeGuard, /Parent 1C BUILD mode/);
  resetModeStateForTests();
});

test('ASK child allowlist drops mutating tools', () => {
  const tools = childToolAllowlist({
    mode: 'ask',
    agentTools: ['read', 'write', 'edit', 'bash'],
    allTools: ['read', 'write', 'edit', 'bash'],
  });
  assert.deepEqual(tools, ['read']);
});

test('explicit sideEffects wins over mcpReadOnly', () => {
  const agent = { name: '1c-my-agent', tools: ['read'], capabilities: ['mcp'], mcpReadOnly: true, sideEffects: ['mcp-write'] };
  assert.equal(isWriterAgent(agent), true);
  assert.ok(classifySideEffects(agent).includes('mcp-write'));
});

test('exclusive project-tree owners cannot share a batch; reviewer and isolated tester may', () => {
  const developer = { name: '1c-developer', tools: ['write'], resources: { 'project-tree': 'exclusive' } };
  const other = { name: '1c-error-fixer', tools: ['write'], resources: { 'project-tree': 'exclusive' } };
  const reviewer = { name: '1c-code-reviewer', tools: ['read'], sideEffects: ['mcp-read'], resources: { 'project-tree': 'shared' } };
  const tester = { name: '1c-tester', tools: ['write'], sideEffects: ['ib-write'], resources: { ib: 'exclusive', 'build-dir': 'exclusive' } };
  const bad = parallelSafety(
    [{ agent: developer.name, task: 't' }, { agent: other.name, task: 't' }],
    writerNames([developer, other]),
    [developer, other],
  );
  assert.equal(bad.ok, false);
  const ok = parallelSafety(
    [{ agent: reviewer.name, task: 't' }, { agent: tester.name, task: 't' }],
    writerNames([reviewer, tester]),
    [reviewer, tester],
  );
  assert.equal(ok.ok, true);
});

test('ASK mode guard is not BUILD', () => {
  assert.match(childModeGuardText('ask'), /ASK mode/);
  assert.doesNotMatch(childModeGuardText('ask'), /BUILD mode/);
  assert.match(childModeGuardText('build'), /BUILD mode/);
});

