import test from 'node:test';
import assert from 'node:assert/strict';
import { appendActivityItems, activityItemFromEvent, appendTail, assistantTextFromEvent, buildChildResult, consumeJsonLine, createChildOutputBuffer, formatToolCallPreview } from '../lib/child-transport.mjs';
import { resetDiagnostics } from '../lib/diagnostics.mjs';

test('final JSON without trailing newline is flushed', () => {
  const events = [];
  const buf = createChildOutputBuffer({ onEvent: (e) => { events.push(e); } });
  buf.pushStdout('{"type":"message_end","message":{"role":"assistant","content":"hi"}}');
  buf.flushRemainder();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'message_end');
});

test('JSON split across chunks including UTF-8 is reassembled', () => {
  const events = [];
  const buf = createChildOutputBuffer({ onEvent: (e) => { events.push(e); } });
  const payload = Buffer.from('{"type":"message_end","message":{"role":"assistant","content":"Привет"}}\n', 'utf8');
  buf.pushStdout(payload.subarray(0, 20));
  buf.pushStdout(payload.subarray(20));
  assert.equal(events.length, 1);
  assert.match(events[0].message.content, /Привет/);
});

test('malformed intermediate line is skipped', () => {
  const events = [];
  const buf = createChildOutputBuffer({ onEvent: (e) => { events.push(e); } });
  buf.pushStdout('not-json\n{"type":"ok"}\n');
  assert.equal(events.length, 1);
  assert.equal(consumeJsonLine('   ', () => {}).skipped, true);
});

test('stdout and stderr caps set outputTruncated', () => {
  resetDiagnostics();
  const buf = createChildOutputBuffer({ stdoutMaxBytes: 64, stderrMaxBytes: 32, onEvent: () => {} });
  buf.pushStdout('x'.repeat(200));
  buf.pushStderr('e'.repeat(200));
  const snap = buf.snapshot();
  assert.equal(snap.outputTruncated, true);
  assert.ok(Buffer.byteLength(snap.stderr) <= 32);
});

test('unicode stderr is capped in UTF-8 bytes', () => {
  const buf = createChildOutputBuffer({ stderrMaxBytes: 1024, onEvent: () => {} });
  buf.pushStderr('я'.repeat(5000));
  assert.ok(Buffer.byteLength(buf.snapshot().stderr) <= 1024);
});

test('oversize JSON frame is reported not parsed', () => {
  const events = [];
  const buf = createChildOutputBuffer({ frameMaxBytes: 64, onEvent: (e) => events.push(e) });
  buf.pushStdout(`${JSON.stringify({ type: 'huge', pad: 'x'.repeat(200) })}\n`);
  const snap = buf.snapshot();
  assert.equal(events.length, 0);
  assert.equal(snap.frameError?.error, 'child_frame_too_large');
  assert.ok(snap.frameError.frameBytes > 64);
});

test('appendTail never retains more than the cap and copies only the tail', () => {
  const huge = Buffer.alloc(32 * 1024 * 1024, 0x61);
  const kept = appendTail(Buffer.from('prefix'), huge, 1024);
  assert.equal(kept.length, 1024);
  assert.equal(kept.toString('utf8'), 'a'.repeat(1024));
});

test('oversized single stdout chunk is truncated without keeping the frame', () => {
  const buf = createChildOutputBuffer({ stdoutMaxBytes: 1024, frameMaxBytes: 4096 });
  buf.pushStdout(Buffer.alloc(32 * 1024 * 1024, 0x61));
  const snap = buf.snapshot();
  assert.equal(snap.outputTruncated, true);
  assert.equal(snap.stdoutBytes, 32 * 1024 * 1024);
  assert.equal(snap.frameError?.error, 'child_frame_too_large');
});

test('structured child result carries timeout metadata', () => {
  const result = buildChildResult({ ok: false, exitCode: null, signal: 'SIGKILL', timedOut: true, durationMs: 12, outputTruncated: true });
  assert.equal(result.timedOut, true);
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.outputTruncated, true);
});

test('assistantTextFromEvent reads message_end, thinking fallback, and agent_end', () => {
  assert.equal(assistantTextFromEvent({ type: 'message_end', message: { role: 'assistant', content: 'plain' } }), 'plain');
  assert.equal(assistantTextFromEvent({
    type: 'message_end',
    message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'visible' }] },
  }), 'visible');
  assert.match(assistantTextFromEvent({
    type: 'message_end',
    message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'only-think' }] },
  }), /only-think/);
  assert.match(assistantTextFromEvent({
    type: 'message_end',
    message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'fetch failed' },
  }), /fetch failed/);
  assert.match(assistantTextFromEvent({
    type: 'agent_end',
    messages: [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'one' },
      { role: 'assistant', content: [{ type: 'text', text: 'two' }] },
    ],
  }), /one\n\ntwo/);
});

test('activityItemFromEvent maps tool_execution and upserts by toolCallId', () => {
  const start = activityItemFromEvent({
    type: 'tool_execution_start',
    toolCallId: 't1',
    toolName: 'read',
    args: { path: 'src/Module.bsl' },
  });
  assert.equal(start.type, 'tool');
  assert.equal(start.status, 'running');
  assert.match(start.preview, /read src\/Module\.bsl/);
  const end = activityItemFromEvent({
    type: 'tool_execution_end',
    toolCallId: 't1',
    toolName: 'read',
    args: { path: 'src/Module.bsl' },
    isError: false,
  });
  const log = appendActivityItems(appendActivityItems([], start), end);
  assert.equal(log.length, 1);
  assert.equal(log[0].status, 'done');
  const grep = activityItemFromEvent({
    type: 'tool_execution_start',
    toolCallId: 't2',
    toolName: 'grep',
    args: { pattern: 'курс', path: 'src' },
  });
  assert.match(grep.preview, /grep \/курс\//);
  const fromMessage = activityItemFromEvent({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 't3', name: 'find', arguments: { pattern: '*.bsl', path: 'src' } },
        { type: 'text', text: 'Looking around' },
      ],
    },
  });
  assert.equal(Array.isArray(fromMessage), true);
  assert.equal(fromMessage[0].name, 'find');
  assert.equal(fromMessage[1].type, 'text');
  assert.match(formatToolCallPreview('bash', { command: 'git status' }), /\$ git status/);
  const capped = appendActivityItems([], Array.from({ length: 50 }, (_, i) => ({ type: 'tool', toolCallId: `n${i}`, name: 'read', preview: `read ${i}` })), 40);
  assert.equal(capped.length, 40);
  assert.equal(capped[0].toolCallId, 'n10');
});
