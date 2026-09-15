import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluatePlanMcpProxyCall,
  evaluatePlanMcpToolCall,
  evaluatePlanToolCall,
  evaluateReadOnlyToolCall,
  evaluateAnonMcpCall,
  evaluateAnonWriteCall,
  describeMcpCall,
  isRecallMcpCall,
  getPlanVisibleTools,
  getReadOnlyVisibleTools,
  resolvePlanningWrite,
  resolveAnonPendingRoot,
  resolveAnonHandoffRoots,
  libCall,
  fallbackAnonVerdict,
} from '../lib/plan-policy.mjs';

test('PLAN blocks project code writes and shell', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-plan-'));
  assert.equal(evaluatePlanToolCall(cwd, 'write', { path: 'src/Module.bsl' }).allowed, false);
  assert.equal(evaluatePlanToolCall(cwd, 'bash', { command: 'mkdir x' }).allowed, false);
});

test('PLAN permits only scoped planning writes', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-plan-'));
  assert.equal(evaluatePlanToolCall(cwd, 'write', { path: 'openspec/changes/x/proposal.md' }).allowed, true);
  assert.equal(evaluatePlanToolCall(cwd, 'edit', { path: '.pi/1c/plans/p.md' }).allowed, true);
});

test('PLAN rejects symlink escape', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-plan-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-out-'));
  fs.mkdirSync(path.join(cwd, 'openspec'), { recursive: true });
  fs.symlinkSync(outside, path.join(cwd, 'openspec', 'escape'));
  assert.equal(resolvePlanningWrite(cwd, 'openspec/escape/pwn.md').allowed, false);
});

test('PLAN visible tools deny unknown custom mutators by default', () => {
  const tools = getPlanVisibleTools(['read','bash','write','edit','delete_database','syntaxcheck','subagent_1c'], ['read','bash','write','edit','delete_database','syntaxcheck','subagent_1c']);
  assert.deepEqual(tools.sort(), ['edit','read','subagent_1c','syntaxcheck','write'].sort());
});

test('PLAN allows only the explicit read-only MCP inventory', () => {
  assert.equal(evaluatePlanMcpToolCall('knowledge', 'read').allowed, true);
  assert.equal(evaluatePlanMcpToolCall('memory', 'recall').allowed, true);
  assert.equal(evaluatePlanMcpToolCall('knowledge', 'write').allowed, false);
  assert.equal(evaluatePlanMcpToolCall('memory', 'remember').allowed, false);
  assert.equal(evaluatePlanMcpToolCall('other', 'read').allowed, false);
});

test('PLAN independently blocks MCP proxy mutations without the adapter', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-plan-'));
  assert.equal(evaluatePlanMcpProxyCall({ tool: 'recall' }).allowed, true);
  assert.equal(evaluatePlanMcpProxyCall({ tool: 'search' }).allowed, true);
  assert.equal(evaluatePlanMcpProxyCall({ tool: 'remember' }).allowed, false);
  assert.equal(evaluatePlanMcpProxyCall({ tool: 'write', server: 'knowledge' }).allowed, false);
  assert.equal(evaluatePlanMcpProxyCall({ action: 'auth-start' }).allowed, false);
  assert.equal(evaluatePlanToolCall(cwd, 'mcp', { tool: 'remember' }).allowed, false);
  assert.equal(evaluatePlanToolCall(cwd, 'mcp__knowledge', { tool: 'write' }).allowed, false);
  assert.equal(evaluatePlanToolCall(cwd, 'mcp__knowledge', { tool: 'search' }).allowed, true);
});

test('PLAN visible tools keep the mcp proxy and omit mcpScript', () => {
  const tools = getPlanVisibleTools(
    ['read','bash','write','mcp','mcpScript','syntaxcheck'],
    ['read','bash','write','mcp','mcpScript','syntaxcheck'],
  );
  assert.ok(tools.includes('mcp'));
  assert.ok(tools.includes('read'));
  assert.ok(tools.includes('write'));
  assert.equal(tools.includes('mcpScript'), false);
  assert.equal(tools.includes('bash'), false);
});

test('PLAN visible tools do not invent mcp when it was not active', () => {
  const tools = getPlanVisibleTools(['read'], ['read','mcp']);
  assert.equal(tools.includes('mcp'), false);
});

test('ASK hides write/edit and denies every file write including planning roots', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-ask-'));
  const active = ['read', 'write', 'edit', 'bash', 'syntaxcheck', 'subagent_1c', 'mcp'];
  const tools = getReadOnlyVisibleTools('ask', active, active);
  assert.equal(tools.includes('write'), false);
  assert.equal(tools.includes('edit'), false);
  assert.ok(tools.includes('read'));
  assert.ok(tools.includes('subagent_1c'));
  assert.ok(tools.includes('mcp'));
  assert.equal(evaluateReadOnlyToolCall('ask', cwd, 'write', { path: 'openspec/x.md' }).allowed, false);
  assert.equal(evaluateReadOnlyToolCall('ask', cwd, 'edit', { path: '.pi/1c/plans/p.md' }).allowed, false);
  assert.equal(evaluateReadOnlyToolCall('ask', cwd, 'bash', { command: 'ls' }).allowed, false);
  assert.equal(evaluateReadOnlyToolCall('ask', cwd, 'read', { path: 'AGENTS.md' }).allowed, true);
});

test('PLAN still allows scoped planning writes through the read-only evaluator', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-plan-'));
  const tools = getReadOnlyVisibleTools('plan', ['read', 'write', 'edit'], ['read', 'write', 'edit']);
  assert.ok(tools.includes('write'));
  assert.equal(evaluateReadOnlyToolCall('plan', cwd, 'write', { path: 'openspec/changes/x/proposal.md' }).allowed, true);
  assert.equal(evaluateReadOnlyToolCall('plan', cwd, 'write', { path: 'src/Module.bsl' }).allowed, false);
});

test('describeMcpCall and isRecallMcpCall cover adapter shapes', () => {
  assert.deepEqual(describeMcpCall('mcp', { server: 'memory', tool: 'memory_recall' }), { server: 'memory', tool: 'recall' });
  assert.deepEqual(describeMcpCall('mcp__knowledge__find', {}), { server: 'knowledge', tool: 'find' });
  assert.deepEqual(describeMcpCall('memory_remember', {}), { server: 'memory', tool: 'remember' });
  assert.equal(describeMcpCall('read', { path: 'x' }), null);
  assert.equal(isRecallMcpCall('mcp', { server: 'memory', tool: 'recall' }), true);
  assert.equal(isRecallMcpCall('mcp', { server: 'memory', tool: 'remember' }), false);
  assert.equal(isRecallMcpCall('mcp__knowledge__search', {}), true);
});

test('evaluateAnonMcpCall is fail-closed and keeps health', () => {
  assert.equal(evaluateAnonMcpCall(0, 'memory', 'remember').allowed, true);
  assert.equal(evaluateAnonMcpCall(1, 'memory', 'remember').allowed, false);
  assert.equal(evaluateAnonMcpCall(1, 'memory', 'recall').allowed, true);
  assert.equal(evaluateAnonMcpCall(1, 'knowledge', 'write').allowed, false);
  assert.equal(evaluateAnonMcpCall(1, 'memory', 'invented_tool').allowed, false);
  assert.equal(evaluateAnonMcpCall(1, 'memory', 'health').allowed, true);
  assert.equal(evaluateAnonMcpCall(2, 'memory', 'health').allowed, true);
  assert.equal(evaluateAnonMcpCall(2, 'memory', 'recall').allowed, false);
  assert.equal(evaluateAnonMcpCall(2, 'knowledge', 'find').allowed, false);
  assert.equal(evaluateAnonMcpCall(1, 'docs', 'write').allowed, true);
});

test('evaluateAnonWriteCall blocks portable pending and handoff roots by level', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-anon-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-profile-'));
  const prev = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = profile;
  try {
    const pending = path.join(profile, 'state', 'agent-memory', 'pending', 'x.md');
    assert.equal(resolveAnonPendingRoot(), path.join(profile, 'state', 'agent-memory', 'pending'));
    assert.ok(resolveAnonHandoffRoots(cwd).some((root) => root.endsWith('handoffs')));
    assert.equal(evaluateAnonWriteCall(1, 'write', { path: pending }, cwd).allowed, false);
    assert.equal(evaluateAnonWriteCall(1, 'write', { path: 'src/Module.bsl' }, cwd).allowed, true);
    assert.equal(evaluateAnonWriteCall(1, 'write', { path: 'handoffs/note.md' }, cwd).allowed, true);
    assert.equal(evaluateAnonWriteCall(3, 'write', { path: 'handoffs/note.md' }, cwd).allowed, false);
    assert.equal(evaluateAnonWriteCall(3, 'write', { path: path.join(cwd, '.pi', '1c', 'handoffs', 'h.md') }, cwd).allowed, false);
    assert.equal(evaluateAnonWriteCall(0, 'write', { path: pending }, cwd).allowed, true);
  } finally {
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  }
});

test('libCall fail-closed fallback still blocks anon writes when a lib export is missing', () => {
  assert.equal(libCall(undefined, [1]), undefined);
  assert.equal(libCall(() => { throw new Error('boom'); }, []), undefined);
  assert.equal(libCall((a, b) => a + b, [1, 2]), 3);
  assert.equal(fallbackAnonVerdict(1, { tool: 'memory_remember' }).allowed, false);
  assert.equal(fallbackAnonVerdict(2, { tool: 'memory_recall' }).allowed, false);
  assert.equal(fallbackAnonVerdict(1, { path: '/tmp/state/agent-memory/pending/x.md' }).allowed, false);
  assert.equal(fallbackAnonVerdict(3, { path: 'handoffs/note.md' }).allowed, false);
  assert.equal(fallbackAnonVerdict(1, { path: 'src/Module.bsl' }).allowed, true);
  const missingExport = undefined;
  const viaMissing = libCall(missingExport, [1, 'memory_remember']);
  const verdict = viaMissing ?? fallbackAnonVerdict(1, { tool: 'memory_remember' });
  assert.equal(verdict.allowed, false);
});
