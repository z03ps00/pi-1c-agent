import { emitDiagnostic } from './diagnostics.mjs';

export const DEFAULT_STDOUT_MAX_BYTES = 1_048_576;
export const DEFAULT_STDERR_MAX_BYTES = 262_144;
export const DEFAULT_FRAME_MAX_BYTES = 3_145_728;

export function readByteCap(name, fallback) {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) && n >= 1024 ? Math.trunc(n) : fallback;
}

export function consumeJsonLine(line, onEvent) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return { ok: true, skipped: true };
  try {
    const value = JSON.parse(trimmed);
    if (typeof onEvent === 'function') onEvent(value);
    return { ok: true, value };
  } catch {
    return { ok: false, malformed: true };
  }
}

function capBuffer(buf, maxBytes) {
  if (buf.length <= maxBytes) return buf;
  return buf.subarray(buf.length - maxBytes);
}

export function createChildOutputBuffer({
  stdoutMaxBytes = readByteCap('PI_1C_CHILD_STDOUT_MAX_BYTES', DEFAULT_STDOUT_MAX_BYTES),
  stderrMaxBytes = readByteCap('PI_1C_CHILD_STDERR_MAX_BYTES', DEFAULT_STDERR_MAX_BYTES),
  frameMaxBytes = readByteCap('PI_1C_CHILD_FRAME_MAX_BYTES', DEFAULT_FRAME_MAX_BYTES),
  onEvent,
} = {}) {
  let parseBuf = Buffer.alloc(0);
  let retainedStdout = Buffer.alloc(0);
  let retainedStderr = Buffer.alloc(0);
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputTruncated = false;
  let lastText = '';
  let frameError = null;

  function noteTruncation(stream) {
    if (!outputTruncated) emitDiagnostic('subagent.stdout.truncated', { stream });
    outputTruncated = true;
  }

  function handleEvent(event) {
    if (typeof onEvent === 'function') {
      const text = onEvent(event);
      if (typeof text === 'string' && text) lastText = text;
      return;
    }
    if (event?.type === 'message_end' && event?.message?.role === 'assistant') {
      const content = event.message.content;
      if (typeof content === 'string' && content) lastText = content;
      else if (Array.isArray(content)) {
        const text = content.filter((x) => x?.type === 'text').map((x) => String(x.text ?? '')).join('\n');
        if (text) lastText = text;
      }
    }
  }

  function noteOversize(frameBytes) {
    frameError = { error: 'child_frame_too_large', frameBytes };
    emitDiagnostic('subagent.frame.too_large', { frameBytes });
  }

  function handleFrame(frame) {
    if (frame.length > frameMaxBytes) {
      noteOversize(frame.length);
      return;
    }
    consumeJsonLine(frame.toString('utf8'), handleEvent);
  }

  function pushStdout(chunk) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''), 'utf8');
    stdoutBytes += piece.length;
    parseBuf = Buffer.concat([parseBuf, piece]);
    retainedStdout = capBuffer(Buffer.concat([retainedStdout, piece]), stdoutMaxBytes);
    if (stdoutBytes > stdoutMaxBytes) noteTruncation('stdout');
    for (;;) {
      const nl = parseBuf.indexOf(0x0a);
      if (nl < 0) break;
      handleFrame(parseBuf.subarray(0, nl));
      parseBuf = parseBuf.subarray(nl + 1);
    }
    if (parseBuf.length > frameMaxBytes) {
      noteOversize(parseBuf.length);
      parseBuf = Buffer.alloc(0);
    }
  }

  function pushStderr(chunk) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''), 'utf8');
    stderrBytes += piece.length;
    retainedStderr = Buffer.concat([retainedStderr, piece]);
    if (retainedStderr.length > stderrMaxBytes) {
      noteTruncation('stderr');
      retainedStderr = retainedStderr.subarray(retainedStderr.length - stderrMaxBytes);
    }
  }

  function flushRemainder() {
    if (parseBuf.length) {
      handleFrame(parseBuf);
      parseBuf = Buffer.alloc(0);
    }
  }

  function snapshot() {
    return {
      lastText,
      stderr: retainedStderr.toString('utf8'),
      outputTruncated,
      stdoutBytes,
      stderrBytes,
      frameError,
    };
  }

  return { pushStdout, pushStderr, flushRemainder, snapshot };
}

export function buildChildResult({
  ok,
  exitCode = null,
  signal = null,
  timedOut = false,
  durationMs = 0,
  outputTruncated = false,
  handoff = null,
  output = '',
  frameError = null,
} = {}) {
  const result = {
    ok: Boolean(ok) && !frameError,
    exitCode,
    signal,
    timedOut: Boolean(timedOut),
    durationMs: Number(durationMs) || 0,
    outputTruncated: Boolean(outputTruncated),
    handoff,
    output,
  };
  if (frameError) Object.assign(result, frameError);
  return result;
}
