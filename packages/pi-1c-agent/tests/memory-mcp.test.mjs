import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpToolCall, resetMcpSessionsForTests, invalidateSession } from '../lib/memory-mcp.mjs';

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

test('concurrent stale-session recoveries share one initialize', async () => {
  resetMcpSessionsForTests();
  let inits = 0;
  let toolCalls = 0;
  const fetchImpl = async (_url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    if (body.method === 'initialize') {
      inits += 1;
      await new Promise((r) => setTimeout(r, 30));
      return {
        ok: true,
        headers: { get: (k) => String(k).toLowerCase() === 'mcp-session-id' ? `sess-${inits}` : null },
        text: async () => '{}',
      };
    }
    if (body.method === 'notifications/initialized') {
      return { ok: true, headers: { get: () => null }, text: async () => '' };
    }
    toolCalls += 1;
    if (opts.headers?.['mcp-session-id'] === 'sess-1' && toolCalls <= 8) {
      return { ok: false, headers: { get: () => 'sess-1' }, text: async () => 'expired' };
    }
    return {
      ok: true,
      headers: { get: () => 'sess-2' },
      text: async () => JSON.stringify({ result: { content: [{ type: 'text', text: 'ok' }] } }),
    };
  };
  await mcpToolCall({ target: 'memory', tool: 'recall', args: { query: 'warm' }, fetchImpl });
  await Promise.all(Array.from({ length: 8 }, () => mcpToolCall({
    target: 'memory',
    tool: 'recall',
    args: { query: 'x' },
    fetchImpl,
  })));
  assert.ok(inits <= 2);
});

test('late failure does not drop a replaced session', async () => {
  resetMcpSessionsForTests();
  const { memoryMcpUrls } = await import('../lib/memory-mcp.mjs');
  const fake = fakeFetch({ calls: Array.from({ length: 4 }, () => ({ ok: true, text: 'ok' })) });
  await mcpToolCall({ target: 'memory', tool: 'recall', args: { query: 'a' }, fetchImpl: fake.fetchImpl });
  assert.equal(invalidateSession(memoryMcpUrls().memory, 'stale-old-id'), false);
  const result = await mcpToolCall({ target: 'memory', tool: 'recall', args: { query: 'b' }, fetchImpl: fake.fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(fake.stats().inits, 1);
});
