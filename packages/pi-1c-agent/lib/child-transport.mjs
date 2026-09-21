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

export function appendTail(current, piece, maxBytes) {
  const cap = Number(maxBytes) || 0;
  if (cap <= 0) return Buffer.alloc(0);
  const src = Buffer.isBuffer(piece) ? piece : Buffer.from(String(piece ?? ''), 'utf8');
  const prev = Buffer.isBuffer(current) ? current : Buffer.alloc(0);
  if (src.length >= cap) return Buffer.from(src.subarray(src.length - cap));
  const keep = cap - src.length;
  const left = prev.length > keep ? prev.subarray(prev.length - keep) : prev;
  if (!left.length) return Buffer.from(src);
  return Buffer.concat([left, src], left.length + src.length);
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
    retainedStdout = appendTail(retainedStdout, piece, stdoutMaxBytes);
    if (stdoutBytes > stdoutMaxBytes) noteTruncation('stdout');
    let offset = 0;
    while (offset < piece.length) {
      const nl = piece.indexOf(0x0a, offset);
      if (nl < 0) {
        const remaining = piece.subarray(offset);
        const nextBytes = parseBuf.length + remaining.length;
        if (nextBytes > frameMaxBytes) {
          noteOversize(nextBytes);
          parseBuf = Buffer.alloc(0);
          return;
        }
        parseBuf = parseBuf.length
          ? Buffer.concat([parseBuf, remaining], nextBytes)
          : Buffer.from(remaining);
        return;
      }
      const linePart = piece.subarray(offset, nl);
      const frameBytes = parseBuf.length + linePart.length;
      if (frameBytes > frameMaxBytes) {
        noteOversize(frameBytes);
        parseBuf = Buffer.alloc(0);
        offset = nl + 1;
        continue;
      }
      const frame = parseBuf.length
        ? Buffer.concat([parseBuf, linePart], frameBytes)
        : linePart;
      parseBuf = Buffer.alloc(0);
      handleFrame(frame);
      offset = nl + 1;
    }
  }

  function pushStderr(chunk) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''), 'utf8');
    stderrBytes += piece.length;
    if (stderrBytes > stderrMaxBytes || piece.length > stderrMaxBytes) noteTruncation('stderr');
    retainedStderr = appendTail(retainedStderr, piece, stderrMaxBytes);
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
