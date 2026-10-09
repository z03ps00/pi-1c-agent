#!/usr/bin/env node
import { createNdjsonReader } from '../../lib/acp-bridge.mjs';

let streaming = false;
let uiWait = null;

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, command, extra = {}) {
  write({ type: 'response', id, command, success: true, ...extra });
}

async function onPrompt(message) {
  const text = String(message.message || '').trim();
  if (text === '/mode') {
    write({
      type: 'extension_ui_request',
      id: 'ui-mode',
      method: 'select',
      title: 'Режим',
      options: ['ask', 'plan', 'build'],
    });
    await new Promise((resolve) => {
      uiWait = resolve;
    });
    reply(message.id, 'prompt');
    return;
  }
  if (/^\/mode (ask|plan|build)\b/.test(text)) {
    const mode = text.split(/\s+/)[1];
    write({ type: 'extension_ui_request', id: 'ui-notify', method: 'notify', message: `mode=${mode}` });
    reply(message.id, 'prompt');
    return;
  }
  if (text === 'sleep') {
    streaming = true;
    reply(message.id, 'prompt');
    write({ type: 'agent_start' });
    write({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'working' } });
    return;
  }
  reply(message.id, 'prompt');
  write({ type: 'agent_start' });
  write({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello' } });
  write({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'think' } });
  write({
    type: 'tool_execution_start',
    toolCallId: 'call-1',
    toolName: 'read',
    args: { path: 'src/mod.bsl' },
  });
  write({
    type: 'tool_execution_end',
    toolCallId: 'call-1',
    toolName: 'read',
    isError: false,
    result: { content: [{ type: 'text', text: 'file' }] },
  });
  write({
    type: 'agent_end',
    messages: [{ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Hello' }] }],
  });
  write({ type: 'agent_settled' });
}

const reader = createNdjsonReader((line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.type === 'extension_ui_response') {
    const resolve = uiWait;
    uiWait = null;
    if (resolve) resolve(message);
    return;
  }
  if (message.type === 'get_commands') {
    reply(message.id, 'get_commands', {
      data: {
        commands: [
          { name: 'doctor', description: 'Диагностика', source: 'extension' },
          { name: 'mode', description: 'Режим', source: 'extension' },
        ],
      },
    });
    return;
  }
  if (message.type === 'get_state') {
    reply(message.id, 'get_state', { data: { isStreaming: streaming, isCompacting: false } });
    return;
  }
  if (message.type === 'abort') {
    streaming = false;
    reply(message.id, 'abort');
    write({ type: 'agent_settled' });
    return;
  }
  if (message.type === 'prompt') void onPrompt(message);
});

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => reader.push(chunk));
process.stdin.on('end', () => {
  reader.end();
  process.exit(0);
});
