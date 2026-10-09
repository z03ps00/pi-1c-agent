import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ACP_PROTOCOL_VERSION = 1;

export const SESSION_MODES = Object.freeze([
  { id: 'ask', name: 'Ask', description: 'Только чтение' },
  { id: 'plan', name: 'Plan', description: 'План без правок кода проекта' },
  { id: 'build', name: 'Build', description: 'Правки и команды' },
]);

const DIALOG_METHODS = new Set(['select', 'confirm', 'input', 'editor']);
const MODE_IDS = new Set(SESSION_MODES.map((mode) => mode.id));

export class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createNdjsonReader(onLine) {
  let pending = '';
  function take(line) {
    const text = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (text.trim()) onLine(text);
  }
  return {
    push(chunk) {
      pending += String(chunk ?? '');
      let index = pending.indexOf('\n');
      while (index >= 0) {
        take(pending.slice(0, index));
        pending = pending.slice(index + 1);
        index = pending.indexOf('\n');
      }
    },
    end() {
      if (pending.length) take(pending);
      pending = '';
    },
  };
}

export function overlayHint(request) {
  const title = String(request?.title || '').trim();
  const head = title ? `Оверлей «${title}» отменён.` : 'Оверлей отменён.';
  return `${head} Передайте аргумент команды, например /mode build или /init from-cfe.`;
}

export function piLaunch(env = process.env) {
  const configured = String(env.PI_1C_ACP_PI || '').trim();
  const rpcArgs = ['--mode', 'rpc', '--1c-mode', 'ask'];
  if (configured && /\.(mjs|cjs|js)$/.test(configured)) {
    return { command: process.execPath, args: [configured, ...rpcArgs] };
  }
  return { command: configured || 'pi', args: rpcArgs };
}

function agentVersion() {
  try {
    const raw = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    return String(JSON.parse(raw).version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function textBlock(text) {
  return { type: 'text', text: String(text ?? '') };
}

function toolKind(name) {
  switch (String(name || '')) {
    case 'read': return 'read';
    case 'write':
    case 'edit': return 'edit';
    case 'bash': return 'execute';
    case 'grep':
    case 'find':
    case 'ls': return 'search';
    default: return 'other';
  }
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && typeof part === 'object' && part.type === 'text' && part.text)
    .map((part) => String(part.text))
    .join('\n');
}

function locationsFromArgs(args) {
  const file = args && typeof args === 'object' ? (args.file_path || args.path) : '';
  return typeof file === 'string' && file ? [{ path: file }] : undefined;
}

function stopReasonFromMessage(message) {
  switch (String(message?.stopReason || '')) {
    case 'length': return 'max_tokens';
    case 'refusal': return 'refusal';
    case 'aborted': return 'cancelled';
    default: return 'end_turn';
  }
}

function modeFromPrompt(message) {
  const match = String(message || '').trim().match(/^\/mode\s+(ask|plan|build)\b/);
  return match ? match[1] : null;
}

export function promptFromBlocks(blocks) {
  if (!Array.isArray(blocks)) throw new RpcError(-32602, 'prompt must be an array of content blocks');
  const texts = [];
  const images = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && block.text) texts.push(String(block.text));
    else if (block.type === 'image' && block.data) {
      images.push({
        type: 'image',
        data: String(block.data),
        mimeType: String(block.mimeType || 'image/png'),
      });
    } else if (block.type === 'resource') {
      const resource = block.resource && typeof block.resource === 'object' ? block.resource : {};
      const body = typeof resource.text === 'string' ? resource.text : '';
      const uri = typeof resource.uri === 'string' ? resource.uri : '';
      if (body || uri) texts.push([uri, body].filter(Boolean).join('\n'));
    } else if (block.type === 'resource_link') {
      const uri = typeof block.uri === 'string' ? block.uri : '';
      const name = typeof block.name === 'string' ? block.name : '';
      if (uri || name) texts.push([name, uri].filter(Boolean).join(' '));
    }
  }
  let message = texts.join('\n').trim();
  if (!message && images.length) message = '(image)';
  return { message, images };
}

function normalizeCommands(response) {
  const list = response?.data?.commands;
  if (!response?.success || !Array.isArray(list)) {
    throw new RpcError(-32603, String(response?.error || 'get_commands failed'));
  }
  const commands = [];
  const seen = new Set();
  for (const command of list) {
    const name = String(command?.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    commands.push({ name, description: String(command.description || name) });
  }
  return commands;
}

export function createAcpBridge({ send, spawnPi, log = () => {} }) {
  let initialized = false;
  let child = null;
  let sessionId = null;
  let turn = null;
  let rpcSeq = 0;
  let toolSeq = 0;
  const waiters = new Map();

  function sendUpdate(update) {
    if (!sessionId) return;
    send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } });
  }

  function emitText(kind, text) {
    const value = String(text ?? '');
    if (!value) return;
    sendUpdate({ sessionUpdate: kind, content: textBlock(value) });
  }

  function writePi(message) {
    if (!child?.stdin?.writable) throw new RpcError(-32603, 'pi is not running');
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function rpc(command) {
    const id = `acp-${++rpcSeq}`;
    return new Promise((resolve, reject) => {
      waiters.set(id, { resolve, reject });
      try {
        writePi({ ...command, id });
      } catch (error) {
        waiters.delete(id);
        reject(error);
      }
    });
  }

  function wake() {
    const fn = turn?.onWake;
    if (!fn) return;
    turn.onWake = null;
    fn();
  }

  function waitSignal() {
    if (!turn || turn.settled || turn.cancel) return Promise.resolve();
    return new Promise((resolve) => {
      turn.onWake = resolve;
    });
  }

  function finishTurn(value) {
    if (!turn || turn.done) return;
    turn.done = true;
    const current = turn;
    turn = null;
    if (value instanceof Error) current.reject(value);
    else current.resolve(value);
  }

  function beginTurn() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    turn = {
      cancel: false,
      abortSent: false,
      settled: false,
      running: false,
      stopReason: 'end_turn',
      streamedText: false,
      done: false,
      onWake: null,
      resolve,
      reject,
    };
    return promise;
  }

  function failWaiters(error) {
    const reason = error instanceof Error ? error : new RpcError(-32603, String(error));
    for (const waiter of waiters.values()) waiter.reject(reason);
    waiters.clear();
    if (turn && !turn.done) finishTurn(reason);
  }

  function handleUi(request) {
    if (DIALOG_METHODS.has(request.method)) {
      try {
        writePi({ type: 'extension_ui_response', id: request.id, cancelled: true });
      } catch (error) {
        log(error.message);
      }
      emitText('agent_message_chunk', overlayHint(request));
      return;
    }
    if (request.method === 'notify' && request.message) emitText('agent_message_chunk', request.message);
  }

  function rememberStop(message) {
    if (!turn || message?.role !== 'assistant') return;
    turn.stopReason = stopReasonFromMessage(message);
  }

  function handlePiEvent(event) {
    const type = String(event?.type || '');
    if (type === 'agent_start' && turn) turn.running = true;
    if (type === 'agent_end' && Array.isArray(event.messages)) {
      const assistant = [...event.messages].reverse().find((message) => message?.role === 'assistant');
      rememberStop(assistant);
    }
    if (type === 'agent_settled' && turn) {
      turn.running = false;
      turn.settled = true;
      wake();
    }
    if (type === 'message_start' && turn) turn.streamedText = false;
    if (type === 'message_update') {
      const delta = event.assistantMessageEvent;
      if (delta?.type === 'text_delta' && delta.delta) {
        if (turn) turn.streamedText = true;
        emitText('agent_message_chunk', delta.delta);
      } else if (delta?.type === 'thinking_delta' && delta.delta) {
        emitText('agent_thought_chunk', delta.delta);
      }
    }
    if (type === 'message_end' && event.message?.role === 'assistant') {
      rememberStop(event.message);
      if (!turn?.streamedText) {
        const text = textFromContent(event.message.content);
        if (text) emitText('agent_message_chunk', text);
        else if (event.message.errorMessage) {
          emitText('agent_message_chunk', `ERROR (${event.message.stopReason || 'error'}): ${event.message.errorMessage}`);
        }
      }
    }
    if (type === 'tool_execution_start') {
      const toolCallId = String(event.toolCallId || `tool-${++toolSeq}`);
      const args = event.args && typeof event.args === 'object' ? event.args : {};
      const update = {
        sessionUpdate: 'tool_call',
        toolCallId,
        title: String(event.toolName || 'tool'),
        kind: toolKind(event.toolName),
        status: 'in_progress',
        rawInput: args,
      };
      const locations = locationsFromArgs(args);
      if (locations) update.locations = locations;
      sendUpdate(update);
    }
    if (type === 'tool_execution_update' || type === 'tool_execution_end') {
      const toolCallId = String(event.toolCallId || '');
      if (!toolCallId) return;
      const failed = type === 'tool_execution_end' && event.isError === true;
      const body = type === 'tool_execution_end' ? event.result : event.partialResult;
      const text = textFromContent(body?.content);
      const update = {
        sessionUpdate: 'tool_call_update',
        toolCallId,
        status: type === 'tool_execution_end' ? (failed ? 'failed' : 'completed') : 'in_progress',
      };
      if (text) update.content = [{ type: 'content', content: textBlock(text) }];
      if (type === 'tool_execution_end' && body) update.rawOutput = body;
      sendUpdate(update);
    }
  }

  const piReader = createNdjsonReader((line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      log(`pi stdout is not JSON: ${line.slice(0, 200)}`);
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'response' && message.id != null && waiters.has(String(message.id))) {
      const waiter = waiters.get(String(message.id));
      waiters.delete(String(message.id));
      waiter.resolve(message);
      return;
    }
    if (message.type === 'extension_ui_request') {
      handleUi(message);
      return;
    }
    if (message.type === 'response') return;
    handlePiEvent(message);
  });

  function wireChild(next) {
    child = next;
    next.stdout.setEncoding('utf8');
    next.stdout.on('data', (chunk) => piReader.push(chunk));
    next.stdout.on('end', () => piReader.end());
    next.on('error', (error) => failWaiters(error));
    next.on('close', () => failWaiters(new RpcError(-32603, 'pi exited')));
  }

  function stopChild() {
    const current = child;
    child = null;
    sessionId = null;
    if (!current) return;
    current.stdin?.end?.();
    current.kill?.('SIGTERM');
  }

  async function ensureIdleAfterCancel() {
    if (!turn || turn.abortSent) return;
    turn.abortSent = true;
    try {
      await rpc({ type: 'abort' });
    } catch (error) {
      log(error.message);
    }
  }

  async function driveTurn(message, images, slash) {
    try {
      const command = { type: 'prompt', message };
      if (images.length) command.images = images;
      const response = await rpc(command);
      if (!turn) return;
      if (!response.success) {
        finishTurn(new RpcError(-32603, String(response.error || 'prompt rejected')));
        return;
      }
      if (turn.cancel) {
        await ensureIdleAfterCancel();
        finishTurn('cancelled');
        return;
      }
      if (slash) {
        const state = await rpc({ type: 'get_state' });
        if (!turn) return;
        const busy = Boolean(state?.data?.isStreaming || state?.data?.isCompacting || turn.running);
        if (busy && !turn.settled && !turn.cancel) await waitSignal();
      } else if (!turn.settled) {
        await waitSignal();
      }
      if (!turn) return;
      if (turn.cancel) {
        await ensureIdleAfterCancel();
        finishTurn('cancelled');
        return;
      }
      const mode = modeFromPrompt(message);
      if (mode) sendUpdate({ sessionUpdate: 'current_mode_update', currentModeId: mode });
      finishTurn(turn.stopReason || 'end_turn');
    } catch (error) {
      finishTurn(error instanceof Error ? error : new RpcError(-32603, String(error)));
    }
  }

  function requireSession(params) {
    if (!sessionId || !child) throw new RpcError(-32602, 'session is not open');
    if (params?.sessionId !== sessionId) throw new RpcError(-32602, 'unknown session');
  }

  async function sessionPrompt(params) {
    requireSession(params);
    if (turn) throw new RpcError(-32602, 'a turn is already running');
    const { message, images } = promptFromBlocks(params?.prompt);
    if (!message) throw new RpcError(-32602, 'prompt is empty');
    const pending = beginTurn();
    void driveTurn(message, images, message.trimStart().startsWith('/'));
    return { stopReason: await pending };
  }

  async function dispatch(message) {
    const method = message.method;
    const params = message.params && typeof message.params === 'object' ? message.params : {};
    if (method === 'initialize') {
      initialized = true;
      const requested = Number(params.protocolVersion);
      return {
        protocolVersion: requested === ACP_PROTOCOL_VERSION ? requested : ACP_PROTOCOL_VERSION,
        agentInfo: { name: 'pi-1c', title: 'Pi 1C', version: agentVersion() },
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: { image: true, audio: false, embeddedContext: false },
          mcpCapabilities: { http: false, sse: false },
        },
      };
    }
    if (method === 'session/new') {
      if (!initialized) throw new RpcError(-32602, 'initialize first');
      if (child) throw new RpcError(-32602, 'session already exists');
      const cwd = params.cwd ? path.resolve(String(params.cwd)) : process.cwd();
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        throw new RpcError(-32602, 'cwd is not a directory');
      }
      wireChild(spawnPi({ cwd }));
      try {
        const listed = normalizeCommands(await rpc({ type: 'get_commands' }));
        sessionId = `pi-1c-${randomUUID()}`;
        sendUpdate({ sessionUpdate: 'available_commands_update', availableCommands: listed });
        return {
          sessionId,
          modes: {
            currentModeId: 'ask',
            availableModes: SESSION_MODES.map((mode) => ({ ...mode })),
          },
        };
      } catch (error) {
        stopChild();
        throw error;
      }
    }
    if (method === 'session/prompt') return sessionPrompt(params);
    if (method === 'session/set_mode') {
      const modeId = String(params.modeId || '');
      if (!MODE_IDS.has(modeId)) throw new RpcError(-32602, `Unknown modeId: ${modeId}`);
      await sessionPrompt({
        sessionId: params.sessionId,
        prompt: [{ type: 'text', text: `/mode ${modeId}` }],
      });
      return {};
    }
    if (method === 'session/cancel') {
      if (turn && params.sessionId === sessionId) {
        turn.cancel = true;
        wake();
      }
      return undefined;
    }
    throw new RpcError(-32601, `Method not found: ${method}`);
  }

  async function onClientLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    if (!message || typeof message !== 'object' || typeof message.method !== 'string') {
      send({
        jsonrpc: '2.0',
        id: message && typeof message === 'object' ? message.id ?? null : null,
        error: { code: -32600, message: 'Invalid Request' },
      });
      return;
    }
    const notify = message.id == null;
    try {
      const result = await dispatch(message);
      if (!notify) send({ jsonrpc: '2.0', id: message.id, result: result ?? {} });
    } catch (error) {
      if (notify) {
        log(error?.message || String(error));
        return;
      }
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: Number.isInteger(error?.code) ? error.code : -32603,
          message: error?.message || 'Internal error',
        },
      });
    }
  }

  const clientReader = createNdjsonReader((line) => {
    void onClientLine(line);
  });

  return {
    pushClientChunk(chunk) {
      clientReader.push(chunk);
    },
    pushClientEnd() {
      clientReader.end();
      failWaiters(new RpcError(-32603, 'client closed'));
      stopChild();
    },
    stop() {
      failWaiters(new RpcError(-32603, 'acp bridge stopped'));
      stopChild();
    },
  };
}
