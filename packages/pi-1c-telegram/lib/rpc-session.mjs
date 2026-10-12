import { spawn } from 'node:child_process';
import { createNdjsonReader } from '../../pi-1c-agent/lib/acp-bridge.mjs';

const WAITING = new Set(['select', 'confirm', 'input', 'editor']);

export function rpcArgs({ resume = 'fresh', sessionFile = '' } = {}) {
  const args = ['--mode', 'rpc', '--1c-mode', 'ask'];
  if (resume === 'continue') args.push('--continue');
  else if (resume === 'session' && sessionFile) args.push('--session', sessionFile);
  return args;
}

export function createRpcSession({
  command = process.env.PI_CMD || 'pi',
  cwd,
  profileDir,
  resume = 'fresh',
  sessionFile = '',
  spawnImpl = spawn,
  onDialog = () => ({ cancelled: true }),
  onEvent = () => {},
  log = () => {},
} = {}) {
  let rpcSeq = 0;
  const waiters = new Map();
  let child = null;
  let closed = false;
  let turnSettled = false;
  let wakeSettled = null;

  function write(message) {
    if (!child?.stdin?.writable) throw new Error('pi is not running');
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function rpc(commandBody) {
    const id = `tg-${++rpcSeq}`;
    return new Promise((resolve, reject) => {
      waiters.set(id, { resolve, reject });
      try {
        write({ ...commandBody, id });
      } catch (error) {
        waiters.delete(id);
        reject(error);
      }
    });
  }

  function respond(request, answer) {
    const message = { type: 'extension_ui_response', id: request.id };
    if (!answer || answer.cancelled) message.cancelled = true;
    else if (request.method === 'confirm') message.confirmed = answer.confirmed === true;
    else if (answer.value !== undefined) message.value = answer.value;
    else message.cancelled = true;
    try {
      write(message);
    } catch (error) {
      log(error.message);
    }
  }

  const reader = createNdjsonReader((line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      log('pi stdout is not JSON');
      return;
    }
    if (message?.type === 'response' && message.id != null && waiters.has(String(message.id))) {
      const waiter = waiters.get(String(message.id));
      waiters.delete(String(message.id));
      waiter.resolve(message);
      return;
    }
    if (message?.type === 'extension_ui_request') {
      if (!WAITING.has(message.method)) {
        onEvent({ type: 'notice', message });
        return;
      }
      Promise.resolve()
        .then(() => onDialog(message))
        .then((answer) => respond(message, answer))
        .catch((error) => {
          log(error?.message || String(error));
          respond(message, { cancelled: true });
        });
      return;
    }
    if (message?.type === 'agent_settled') {
      turnSettled = true;
      const wake = wakeSettled;
      wakeSettled = null;
      if (wake) wake();
    }
    if (message?.type && message.type !== 'response') onEvent(message);
  });

  function waitSettled() {
    if (turnSettled || closed) return Promise.resolve();
    return new Promise((resolve) => {
      wakeSettled = resolve;
    });
  }

  child = spawnImpl(command, rpcArgs({ resume, sessionFile }), {
    cwd,
    env: { ...process.env, PI_CODING_AGENT_DIR: profileDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => reader.push(chunk));
  child.stderr?.on('data', (chunk) => log(String(chunk).slice(0, 500)));
  child.on('error', (error) => {
    for (const waiter of waiters.values()) waiter.reject(error);
    waiters.clear();
  });
  child.on('close', () => {
    closed = true;
    const error = new Error('pi exited');
    for (const waiter of waiters.values()) waiter.reject(error);
    waiters.clear();
    const wake = wakeSettled;
    wakeSettled = null;
    if (wake) wake();
  });

  return {
    async prompt(text) {
      turnSettled = false;
      const response = await rpc({ type: 'prompt', message: String(text ?? '') });
      if (response && response.success === false) {
        throw new Error(String(response.error || 'prompt rejected'));
      }
      const slash = String(text ?? '').trimStart().startsWith('/');
      if (!slash && !turnSettled) await waitSettled();
      else if (slash && !turnSettled) {
        const state = await rpc({ type: 'get_state' });
        const busy = Boolean(state?.data?.isStreaming || state?.data?.isCompacting);
        if (busy && !turnSettled) await waitSettled();
      }
      return response;
    },
    async cancel() {
      try {
        await rpc({ type: 'abort' });
      } catch (error) {
        log(error.message);
      }
    },
    stop() {
      if (closed) return;
      closed = true;
      child.stdin?.end?.();
      child.kill?.('SIGTERM');
    },
  };
}
