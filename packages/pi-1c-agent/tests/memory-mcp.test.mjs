import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpToolCall, resetMcpSessionsForTests } from '../lib/memory-mcp.mjs';

function fakeFetch(plan) {
  let inits = 0;
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async (_url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    if (body.method === 'initialize') {
      inits += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 40));
      active -= 1;
      return {
        ok: true,
        headers: { get: (k) => String(k).toLowerCase() === 'mcp-session-id' ? 'sess-1' : null },
        text: async () => '{}',
      };
    }
    if (body.method === 'notifications/initialized') {
      return { ok: true, headers: { get: () => null }, text: async () => '' };
    }
    const step = plan.calls.shift() ?? { ok: true };
    return {
      ok: step.ok,
      headers: { get: () => 'sess-1' },
      text: async () => JSON.stringify({ result: { content: [{ type: 'text', text: step.text || 'ok' }] } }),
    };
  };
  return { fetchImpl, stats: () => ({ inits, maxActive }) };
}

test('twenty concurrent first calls share one initialize', async () => {
  resetMcpSessionsForTests();
  const fake = fakeFetch({ calls: Array.from({ length: 20 }, () => ({ ok: true, text: 'hit' })) });
  await Promise.all(Array.from({ length: 20 }, () => mcpToolCall({
    target: 'memory',
    tool: 'recall',
    args: { query: 'x' },
    fetchImpl: fake.fetchImpl,
  })));
  const stats = fake.stats();
  assert.equal(stats.inits, 1);
  assert.equal(stats.maxActive, 1);
});

test('expired session resets and retries once', async () => {
  resetMcpSessionsForTests();
  const fake = fakeFetch({ calls: [{ ok: false }, { ok: true, text: 'recovered' }] });
  const result = await mcpToolCall({
    target: 'memory',
    tool: 'recall',
    args: { query: 'x' },
    fetchImpl: fake.fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(fake.stats().inits, 2);
});
