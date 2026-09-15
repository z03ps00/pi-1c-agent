import test from 'node:test';
import assert from 'node:assert/strict';
import { childToolAllowlist, isWriterAgent, parallelSafety, writerNames } from '../lib/agent-policy.mjs';

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
