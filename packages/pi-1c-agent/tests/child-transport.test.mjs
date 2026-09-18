import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChildResult, consumeJsonLine, createChildOutputBuffer } from '../lib/child-transport.mjs';
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

test('structured child result carries timeout metadata', () => {
  const result = buildChildResult({ ok: false, exitCode: null, signal: 'SIGKILL', timedOut: true, durationMs: 12, outputTruncated: true });
  assert.equal(result.timedOut, true);
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.outputTruncated, true);
});
