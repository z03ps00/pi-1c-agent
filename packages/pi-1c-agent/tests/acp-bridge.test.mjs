import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { overlayHint } from '../lib/acp-bridge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, '..', 'tools', 'acp-server.mjs');
const fakePi = path.join(here, 'helpers', 'fake-acp-pi.mjs');
const profileDir = path.resolve(here, '..', '..', '..');

function updatesOf(notes) {
  return notes
    .filter((message) => message.method === 'session/update')
    .map((message) => message.params.update);
}

function createClient(child) {
  let buf = '';
  let next = 1;
  const pending = new Map();
  const notes = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let index = buf.indexOf('\n');
    while (index >= 0) {
      const line = buf.slice(0, index).replace(/\r$/, '');
      buf = buf.slice(index + 1);
      index = buf.indexOf('\n');
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id != null && pending.has(message.id)) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) waiter.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
        else waiter.resolve(message.result);
      } else if (message.method) notes.push(message);
    }
  });
  return {
    notes,
    request(method, params) {
      const id = next++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
  };
}

async function withServer(fn) {
  const stderr = [];
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: profileDir,
      PI_1C_ACP_PI: fakePi,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const client = createClient(child);
  try {
    await fn(client);
  } catch (error) {
    error.message = `${error.message}\nstderr: ${stderr.join('')}`;
    throw error;
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

async function openSession(client) {
  const init = await client.request('initialize', { protocolVersion: 1 });
  const notesAt = client.notes.length;
  const created = await client.request('session/new', { cwd: profileDir });
  return { init, created, fresh: client.notes.slice(notesAt) };
}

function waitFor(pred, label) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (pred()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 5000) {
        clearInterval(timer);
        reject(new Error(`timeout: ${label}`));
      }
    }, 10);
  });
}

test('overlay hint asks for a command argument', () => {
  const text = overlayHint({ title: 'Режим' });
  assert.match(text, /Оверлей «Режим» отменён/);
  assert.match(text, /\/mode build/);
  assert.match(text, /\/init from-cfe/);
});

test('initialize names pi-1c and keeps protocol version 1', async () => {
  await withServer(async (client) => {
    const init = await client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'test' } });
    assert.equal(init.protocolVersion, 1);
    assert.equal(init.agentInfo.name, 'pi-1c');
    assert.equal(init.agentInfo.title, 'Pi 1C');
    assert.equal(init.agentCapabilities.loadSession, false);
    await assert.rejects(client.request('session/load', {}), /Method not found/);
  });
});

test('session/new lists commands and starts in ask', async () => {
  await withServer(async (client) => {
    const { created, fresh } = await openSession(client);
    assert.match(created.sessionId, /^pi-1c-/);
    assert.equal(created.modes.currentModeId, 'ask');
    assert.deepEqual(created.modes.availableModes.map((mode) => mode.id), ['ask', 'plan', 'build']);
    const commands = updatesOf(fresh).find((update) => update.sessionUpdate === 'available_commands_update');
    assert.ok(commands);
    assert.deepEqual(commands.availableCommands.map((command) => command.name), ['doctor', 'mode']);
  });
});

test('prompt streams text, thought, and tool call', async () => {
  await withServer(async (client) => {
    const { created } = await openSession(client);
    const before = client.notes.length;
    const result = await client.request('session/prompt', {
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: 'hello' }],
    });
    assert.equal(result.stopReason, 'end_turn');
    const updates = updatesOf(client.notes.slice(before));
    assert.ok(updates.some((update) => update.sessionUpdate === 'agent_message_chunk' && update.content.text === 'Hello'));
    assert.ok(updates.some((update) => update.sessionUpdate === 'agent_thought_chunk' && update.content.text === 'think'));
    const call = updates.find((update) => update.sessionUpdate === 'tool_call');
    assert.equal(call.toolCallId, 'call-1');
    assert.equal(call.title, 'read');
    assert.equal(call.kind, 'read');
    assert.deepEqual(call.locations, [{ path: 'src/mod.bsl' }]);
    assert.ok(updates.some((update) => update.sessionUpdate === 'tool_call_update' && update.status === 'completed'));
  });
});

test('/mode build switches the session mode without an overlay', async () => {
  await withServer(async (client) => {
    const { created } = await openSession(client);
    const before = client.notes.length;
    const result = await client.request('session/prompt', {
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: '/mode build' }],
    });
    assert.equal(result.stopReason, 'end_turn');
    const updates = updatesOf(client.notes.slice(before));
    assert.ok(updates.some((update) => update.sessionUpdate === 'agent_message_chunk' && update.content.text === 'mode=build'));
    assert.ok(updates.some((update) => update.sessionUpdate === 'current_mode_update' && update.currentModeId === 'build'));
    const set = await client.request('session/set_mode', { sessionId: created.sessionId, modeId: 'plan' });
    assert.deepEqual(set, {});
    assert.ok(updatesOf(client.notes).some((update) => update.sessionUpdate === 'current_mode_update' && update.currentModeId === 'plan'));
  });
});

test('overlay dialogs are cancelled with an argument hint', async () => {
  await withServer(async (client) => {
    const { created } = await openSession(client);
    const before = client.notes.length;
    const result = await client.request('session/prompt', {
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: '/mode' }],
    });
    assert.equal(result.stopReason, 'end_turn');
    const text = updatesOf(client.notes.slice(before))
      .filter((update) => update.sessionUpdate === 'agent_message_chunk')
      .map((update) => update.content.text)
      .join('\n');
    assert.match(text, /Оверлей «Режим» отменён/);
    assert.match(text, /\/mode build/);
  });
});

test('session/cancel aborts a running turn', async () => {
  await withServer(async (client) => {
    const { created } = await openSession(client);
    const pending = client.request('session/prompt', {
      sessionId: created.sessionId,
      prompt: [{ type: 'text', text: 'sleep' }],
    });
    await waitFor(
      () => updatesOf(client.notes).some((update) => update.content?.text === 'working'),
      'working chunk',
    );
    client.notify('session/cancel', { sessionId: created.sessionId });
    const result = await pending;
    assert.equal(result.stopReason, 'cancelled');
  });
});
