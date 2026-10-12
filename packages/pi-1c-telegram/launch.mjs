#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOT_COMMANDS } from './lib/choices.mjs';
import { loadConfig, loadToken, tightenTokenFile, tokenPath } from './lib/config.mjs';
import { telegramReplyMarkup } from './lib/menus.mjs';
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
    const result = await callTelegram(token, 'sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: telegramReplyMarkup(keyboard),
    });
    return result?.message_id;
  },
  async editMessage(chatId, messageId, text) {
    await callTelegram(token, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
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

try {
  await callTelegram(token, 'setMyCommands', { commands: BOT_COMMANDS });
} catch (error) {
  console.error(`Меню команд не записалось: ${error.message}`);
}

console.error('Pi 1C Telegram слушает исходящие обновления. Входящий порт не открывается.');
process.on('unhandledRejection', (error) => {
  console.error(`сбой сети, бот продолжает: ${String(error?.message || error).slice(0, 200)}`);
});

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
  if (!response.ok) {
    let description = '';
    try {
      const failed = await response.json();
      description = String(failed?.description || '');
    } catch { /* body is not JSON */ }
    throw new Error(`telegram ${method} HTTP ${response.status}${description ? ` ${description}` : ''}`);
  }
  const payload = await response.json();
  if (!payload.ok) throw new Error(`telegram ${method} rejected`);
  return payload.result;
}
