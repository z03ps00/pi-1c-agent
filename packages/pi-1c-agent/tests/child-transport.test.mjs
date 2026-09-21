import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTail, buildChildResult, consumeJsonLine, createChildOutputBuffer } from '../lib/child-transport.mjs';
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
