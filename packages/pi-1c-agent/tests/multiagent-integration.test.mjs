import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChildOutputBuffer } from '../lib/child-transport.mjs';
import { classifySideEffects, parallelSafety, writerNames } from '../lib/agent-policy.mjs';
import { ensureMemoryStateDirs, queueItemCounts, queuePendingRecord, tryClaim } from '../lib/memory-reconcile.mjs';
import { mcpToolCall, resetMcpSessionsForTests } from '../lib/memory-mcp.mjs';
import { applyDraft, createDraft, initConfiguration, knowledgeRevision } from '../lib/knowledge.mjs';

const mockPi = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'mock-pi.mjs');

test('mock pi emits a final JSON frame without newline', async () => {
  const events = [];
  const buf = createChildOutputBuffer({ onEvent: (e) => events.push(e) });
  await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [mockPi], { env: { ...process.env, PI_1C_MOCK_PI_BEHAVIOR: 'handoff-no-nl' } });
    proc.stdout.on('data', (d) => buf.pushStdout(d));
    proc.on('error', reject);
    proc.on('close', () => { buf.flushRemainder(); resolve(); });
  });
  assert.equal(events.length, 1);
  assert.match(events[0].message.content, /Upstream Handoff/);
});

test('integration: writer and unknown MCP cannot share a batch', () => {
  const agents = [
    { name: '1c-custom-mcp', tools: ['read'], capabilities: ['mcp'] },
    { name: '1c-developer', tools: ['write', 'edit'] },
  ];
  const safety = parallelSafety(agents.map((a) => ({ agent: a.name, task: 't' })), writerNames(agents), agents);
  assert.equal(safety.ok, false);
  assert.ok(classifySideEffects(agents[0]).includes('unknown'));
});
