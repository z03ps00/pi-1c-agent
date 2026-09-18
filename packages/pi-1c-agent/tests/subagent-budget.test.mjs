import test from 'node:test';
import assert from 'node:assert/strict';
import { maxSubagents, resetSubagentBudgetForTests, subagentInFlight, withSubagentSlot } from '../lib/subagent-budget.mjs';
import { classifySideEffects, isWriterAgent, parallelSafety, selectExecutionStrategy, writerNames } from '../lib/agent-policy.mjs';

test('process-wide budget caps concurrent slots across invocations', async () => {
  resetSubagentBudgetForTests();
  process.env.PI_1C_MAX_SUBAGENTS = '2';
  let current = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: 8 }, () => withSubagentSlot(async () => {
    current += 1;
    peak = Math.max(peak, current);
    await new Promise((r) => setTimeout(r, 20));
    current -= 1;
  })));
  assert.equal(maxSubagents(), 2);
  assert.ok(peak <= 2);
  assert.equal(subagentInFlight(), 0);
  delete process.env.PI_1C_MAX_SUBAGENTS;
  resetSubagentBudgetForTests();
});

test('two undeclared MCP agents are rejected before spawn', () => {
  const agents = [
    { name: '1c-custom-a', tools: ['read'], capabilities: ['mcp'] },
    { name: '1c-custom-b', tools: ['read'], capabilities: ['mcp'] },
  ];
  const safety = parallelSafety(
    agents.map((a) => ({ agent: a.name, task: 't' })),
    writerNames(agents),
    agents,
  );
  assert.equal(safety.ok, false);
  assert.match(safety.reason, /writer|side effect/i);
});

test('declared read-only MCP agent is not a writer', () => {
  const agent = { name: '1c-custom-reader', tools: ['read'], capabilities: ['mcp'], mcpReadOnly: true };
  assert.equal(isWriterAgent(agent), false);
  assert.deepEqual(classifySideEffects(agent), ['mcp-read']);
  const batch = parallelSafety(
    [{ agent: agent.name, task: 't' }, { agent: '1c-explorer', task: 't' }],
    writerNames([agent, { name: '1c-explorer', tools: ['read'], capabilities: ['mcp'] }]),
    [agent, { name: '1c-explorer', tools: ['read'], capabilities: ['mcp'] }],
  );
  assert.equal(batch.ok, true);
});

test('ambiguous invocation is rejected', () => {
  const r = selectExecutionStrategy({ agent: '1c-explorer', task: 't', parallel: [{ agent: '1c-explorer', task: 't' }] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /exactly one/);
});
