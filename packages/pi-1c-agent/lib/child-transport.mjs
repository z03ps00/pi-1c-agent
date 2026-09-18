import { emitDiagnostic } from './diagnostics.mjs';

export const DEFAULT_STDOUT_MAX_BYTES = 1_048_576;
export const DEFAULT_STDERR_MAX_BYTES = 262_144;

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

export function createChildOutputBuffer({
  stdoutMaxBytes = readByteCap('PI_1C_CHILD_STDOUT_MAX_BYTES', DEFAULT_STDOUT_MAX_BYTES),
  stderrMaxBytes = readByteCap('PI_1C_CHILD_STDERR_MAX_BYTES', DEFAULT_STDERR_MAX_BYTES),
  onEvent,
} = {}) {
  let stdout = Buffer.alloc(0);
  let stderr = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputTruncated = false;
  let lastText = '';

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

  function pushStdout(chunk) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk ?? ''), 'utf8');
    stdoutBytes += piece.length;
    stdout = Buffer.concat([stdout, piece]);
    if (stdout.length > stdoutMaxBytes) {
      noteTruncation('stdout');
      stdout = stdout.subarray(0, stdoutMaxBytes);
    }
    for (;;) {
      const nl = stdout.indexOf(0x0a);
      if (nl < 0) break;
      consumeJsonLine(stdout.subarray(0, nl).toString('utf8'), handleEvent);
      stdout = stdout.subarray(nl + 1);
    }
  }

  function pushStderr(chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
    stderrBytes += Buffer.byteLength(text);
    stderr += text;
    if (Buffer.byteLength(stderr) > stderrMaxBytes) {
      noteTruncation('stderr');
      stderr = stderr.slice(stderr.length - stderrMaxBytes);
    }
  }

  function flushRemainder() {
    if (stdout.length) {
      consumeJsonLine(stdout.toString('utf8'), handleEvent);
      stdout = Buffer.alloc(0);
    }
  }

  function snapshot() {
    return {
      lastText,
      stderr,
      outputTruncated,
      stdoutBytes,
      stderrBytes,
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
} = {}) {
  return {
    ok: Boolean(ok),
    exitCode,
    signal,
    timedOut: Boolean(timedOut),
    durationMs: Number(durationMs) || 0,
    outputTruncated: Boolean(outputTruncated),
    handoff,
    output,
  };
}
