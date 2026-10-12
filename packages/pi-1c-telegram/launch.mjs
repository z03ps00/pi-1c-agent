#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadToken, tightenTokenFile, tokenPath } from './lib/config.mjs';
import { createGateway } from './lib/gateway.mjs';
import { pollLoop } from './lib/poll.mjs';
import { runPi } from './lib/panel.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const profileDir = process.env.PI_CODING_AGENT_DIR?.trim()
  || path.resolve(here, '..', '..');

const config = loadConfig(profileDir);
const tokenFile = tokenPath(profileDir);
tightenTokenFile(tokenFile);
const token = loadToken(profileDir);
if (!token) {
  console.error('Нет токена бота. Положите его в state/telegram/bot.token (права 0600).');
  process.exit(1);
}

let piVersion = '?';
try {
  const version = runPi({ profileDir }, ['--version']);
  piVersion = String(version.stdout || '').trim() || '?';
} catch {
  piVersion = '?';
}

const api = {
  async sendMessage(chatId, text, keyboard) {
    await callTelegram(token, 'sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
    });
  },
  async answerCallback(callbackId) {
    await callTelegram(token, 'answerCallbackQuery', { callback_query_id: callbackId });
  },
};

const gateway = createGateway({ profileDir, config, api, piVersion });
const controller = new AbortController();
for (const signalName of ['SIGINT', 'SIGTERM']) {
  process.on(signalName, () => controller.abort());
}

console.error('Pi 1C Telegram слушает исходящие обновления. Входящий порт не открывается.');
await pollLoop({
  token,
  signal: controller.signal,
  log(line) { console.error(line); },
  onUpdates: async (updates) => {
    for (const update of updates) await gateway.handleUpdate(update);
  },
});

async function callTelegram(botToken, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`telegram ${method} HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(`telegram ${method} rejected`);
  return payload.result;
}
