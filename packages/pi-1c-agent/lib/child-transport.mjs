import { emitDiagnostic } from './diagnostics.mjs';

export function assistantContentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const texts = [];
  const thinking = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && part.text) texts.push(String(part.text));
    else if ((part.type === 'thinking' || part.type === 'reasoning') && (part.thinking || part.text || part.reasoning)) {
      thinking.push(String(part.thinking || part.text || part.reasoning));
    }
  }
  return texts.join('\n') || thinking.join('\n');
}

export function assistantTextFromEvent(event) {
  if (!event || typeof event !== 'object') return '';
  if (event.type === 'message_end' || event.type === 'turn_end') {
    const message = event.message;
    if (message?.role !== 'assistant') return '';
    const text = assistantContentText(message.content);
    if (text) return text;
    if (message.errorMessage) return `ERROR (${message.stopReason || 'error'}): ${message.errorMessage}`;
    return '';
  }
  if (event.type === 'agent_end' && Array.isArray(event.messages)) {
    return event.messages
      .filter((message) => message?.role === 'assistant')
      .map((message) => assistantContentText(message.content) || (message.errorMessage ? `ERROR (${message.stopReason || 'error'}): ${message.errorMessage}` : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

export const ACTIVITY_LOG_MAX = 40;

function shortenPath(value, max = 60) {
  const s = String(value || '');
  if (s.length <= max) return s;
  return `…${s.slice(-(max - 1))}`;
}

export function formatToolCallPreview(toolName, args = {}) {
  const name = String(toolName || 'tool');
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  switch (name) {
    case 'bash': {
      const cmd = String(a.command || '...');
      return `$ ${cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd}`;
    }
    case 'read':
      return `read ${shortenPath(a.file_path || a.path || '...')}`;
    case 'write':
      return `write ${shortenPath(a.file_path || a.path || '...')}`;
    case 'edit':
      return `edit ${shortenPath(a.file_path || a.path || '...')}`;
    case 'ls':
      return `ls ${shortenPath(a.path || '.')}`;
    case 'find':
      return `find ${a.pattern || '*'} in ${shortenPath(a.path || '.')}`;
    case 'grep':
      return `grep /${a.pattern || ''}/ in ${shortenPath(a.path || '.')}`;
    default: {
      const first = Object.keys(a)[0];
      const val = first != null ? String(a[first] ?? '') : '';
      const preview = val.length > 40 ? `${val.slice(0, 37)}...` : val;
      return preview ? `${name} ${preview}` : name;
    }
  }
}

function toolActivityItem(event, status) {
  const name = String(event.toolName || event.name || 'tool');
  const args = event.args && typeof event.args === 'object' ? event.args : (event.arguments && typeof event.arguments === 'object' ? event.arguments : {});
  return {
    type: 'tool',
    toolCallId: String(event.toolCallId || event.id || ''),
    name,
    args,
    status,
    preview: formatToolCallPreview(name, args),
  };
}

function clipActivityText(text, max = 240) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw.length > max ? `${raw.slice(0, max - 3)}...` : raw;
}

export function activityItemFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const type = String(event.type || '');
  if (type === 'tool_execution_start') return toolActivityItem(event, 'running');
  if (type === 'tool_execution_end') return toolActivityItem(event, event.isError ? 'error' : 'done');
  if (type === 'message_end' && event.message?.role === 'assistant' && Array.isArray(event.message.content)) {
    const items = [];
    for (const part of event.message.content) {
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'toolCall' || part.type === 'tool_use') {
        items.push(toolActivityItem({
          toolCallId: part.id || part.toolCallId,
          toolName: part.name || part.toolName,
          args: part.arguments || part.args,
        }, 'running'));
      } else if (part.type === 'text' && part.text) {
        const text = clipActivityText(part.text);
        if (text) items.push({ type: 'text', text });
      }
    }
    if (!items.length) return null;
    return items.length === 1 ? items[0] : items;
  }
  return null;
}

export function appendActivityItems(log = [], incoming, maxItems = ACTIVITY_LOG_MAX) {
  const next = Array.isArray(log) ? [...log] : [];
  const raw = incoming == null ? [] : Array.isArray(incoming) ? incoming : [incoming];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'tool' && item.toolCallId) {
      const idx = next.findIndex((x) => x && x.type === 'tool' && x.toolCallId === item.toolCallId);
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...item, args: item.args || next[idx].args };
        continue;
      }
    }
    next.push(item);
  }
  const cap = Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Math.trunc(Number(maxItems)) : ACTIVITY_LOG_MAX;
  return next.length > cap ? next.slice(next.length - cap) : next;
}

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
  const eventTypes = [];
  let lastStopReason = '';
  let lastErrorMessage = '';

  function noteTruncation(stream) {
    if (!outputTruncated) emitDiagnostic('subagent.stdout.truncated', { stream });
    outputTruncated = true;
  }

  function handleEvent(event) {
    if (event?.type) {
      eventTypes.push(event.type);
      if (eventTypes.length > 24) eventTypes.shift();
    }
    const stopReason = event?.message?.stopReason;
    if (typeof stopReason === 'string' && stopReason) lastStopReason = stopReason;
    const errorMessage = event?.message?.errorMessage;
    if (typeof errorMessage === 'string' && errorMessage) lastErrorMessage = errorMessage;
    if (typeof onEvent === 'function') {
      const text = onEvent(event);
      if (typeof text === 'string' && text) lastText = text;
      return;
    }
    if (event?.type === 'message_end' && event?.message?.role === 'assistant') {
      const text = assistantContentText(event.message.content);
      if (text) lastText = text;
      else if (event.message.errorMessage) lastText = `ERROR (${event.message.stopReason || 'error'}): ${event.message.errorMessage}`;
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
      stdoutTail: retainedStdout.toString('utf8').slice(-2000),
      outputTruncated,
      stdoutBytes,
      stderrBytes,
      frameError,
      eventTypes: [...eventTypes],
      lastStopReason,
      lastErrorMessage,
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
