import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REFUSAL, accessDecision, saveConfig, tightenTokenFile } from '../../packages/pi-1c-telegram/lib/config.mjs';
import { chunkText, formatTurn, redactOutgoing } from '../../packages/pi-1c-telegram/lib/format.mjs';
import { parseIncoming } from '../../packages/pi-1c-telegram/lib/choices.mjs';
import { createGateway } from '../../packages/pi-1c-telegram/lib/gateway.mjs';
import { applyModel, coerceThinking, parsePiModelList, profilePaths } from '../../packages/pi-1c-telegram/lib/panel.mjs';
import { modelCatalogView } from '../../packages/pi-1c-telegram/lib/menus.mjs';
import { pollLoop } from '../../packages/pi-1c-telegram/lib/poll.mjs';
import { acceptProject } from '../../packages/pi-1c-telegram/lib/projects.mjs';
import { createRpcSession } from '../../packages/pi-1c-telegram/lib/rpc-session.mjs';
import { OVERLAYS } from '../../packages/pi-1c-telegram/lib/choices.mjs';
import { choiceView, telegramReplyMarkup } from '../../packages/pi-1c-telegram/lib/menus.mjs';
import { decide, initialChat } from '../../packages/pi-1c-telegram/lib/router.mjs';
import { loadConfig } from '../../packages/pi-1c-telegram/lib/config.mjs';
import { pidPath, startGateway } from '../../packages/pi-1c-telegram/lib/service.mjs';
import { createPairing, pinPath, removePin, statusText, tryPair, useHere, writeToken } from '../../packages/pi-1c-telegram/lib/setup.mjs';
import { projectList } from '../../packages/pi-1c-telegram/lib/router.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

const root = profileRoot();

function withProject(extra = {}) {
  return { ...initialChat(), project: '/work/app', ...extra };
}

test('empty allowlist and unknown user refuse without secrets or a session', async () => {
  assert.equal(accessDecision({ allowedUserIds: [] }, 7).ok, false);
  assert.equal(accessDecision({ allowedUserIds: [3] }, 7).reason, 'unknown');
  assert.equal(REFUSAL.includes('auth.json'), false);
  assert.equal(REFUSAL.includes('bot.token'), false);
  const sent = [];
  let opened = false;
  const gateway = createGateway({
    profileDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tg-deny-')),
    config: { allowedUserIds: [], allowedRoots: [], pins: [], recent: [] },
    api: {
      async sendMessage(_chatId, text) { sent.push(text); },
      async answerCallback() {},
    },
    openSession() { opened = true; return { prompt() {}, cancel() {}, stop() {} }; },
  });
  await gateway.handleUpdate({ message: { text: 'привет', from: { id: 7 }, chat: { id: 1 } } });
  assert.deepEqual(sent, [REFUSAL]);
  assert.equal(opened, false);
  assert.equal(gateway.opened, 0);
});

test('a path outside allowed roots does not change the project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-root-'));
  const inside = path.join(dir, 'inside');
  const outside = path.join(dir, 'outside');
  fs.mkdirSync(inside);
  fs.mkdirSync(outside);
  const accepted = acceptProject(inside, { roots: [dir] });
  const rejected = acceptProject(outside, { roots: [inside] });
  assert.equal(accepted.ok, true);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'outside');
  const state = withProject();
  const result = decide(state, { type: 'text', text: outside, allowed: true }, {
    resolvePath: () => rejected,
  });
  assert.equal(result.state.project, '/work/app');
  assert.equal(result.effects.some((effect) => effect.type === 'open'), false);
  assert.match(result.effects[0].text, /вне разрешённых/);
});

test('a busy turn does not start a second one', () => {
  const result = decide(withProject({ busy: true }), { type: 'text', text: 'ещё задача', allowed: true });
  assert.match(result.effects[0].text, /занята/);
  assert.equal(result.effects.some((effect) => effect.type === 'prompt'), false);
  assert.equal(result.state.busy, true);
});

test('an expired button still opens the menu', async () => {
  const sent = [];
  const gateway = createGateway({
    profileDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tg-stale-')),
    config: { allowedUserIds: [1], allowedRoots: [], pins: [], recent: [] },
    api: {
      async sendMessage(_chatId, text) { sent.push(text); },
      async answerCallback() { throw new Error('query is too old'); },
    },
    openSession() { throw new Error('session must not start'); },
  });
  await gateway.handleUpdate({
    callback_query: {
      id: 'old',
      data: 'nav:menu',
      from: { id: 1 },
      message: { chat: { id: 1 } },
    },
  });
  assert.equal(sent.some((text) => text.includes('Проект:')), true);
});

test('model list is one catalog and thinking yes/no is accepted', () => {
  const entries = parsePiModelList([
    'provider      model                            context  max-out  thinking  images',
    'cursor        auto                             256K     16.4K    no        yes',
    'openai-codex  gpt-5.6-luna                     1M       16.4K    yes       yes',
  ].join('\n'));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].thinking, 'no');
  assert.equal(entries[1].thinking, 'yes');
  assert.equal(coerceThinking('no', true), '__REMOVE__');
  assert.equal(coerceThinking('yes', true), '__KEEP__');
  assert.equal(coerceThinking('high', false), '__REMOVE__');
  const view = modelCatalogView(entries, 0);
  assert.match(view.text, /всего 2/);
  const state = withProject({
    catalog: entries,
  });
  const picked = decide(state, { type: 'callback', data: 'cat:0', allowed: true });
  const effect = picked.effects.find((item) => item.op === 'apply-model');
  assert.equal(effect.model, 'auto');
  assert.equal(effect.level, '__REMOVE__');
  assert.equal(picked.state.awaitText, null);
});

test('a project button works on a fresh chat and the next hello stays in it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-keep-'));
  const project = path.join(root, 'app');
  fs.mkdirSync(project);
  const sent = [];
  const prompts = [];
  function make() {
    return createGateway({
      profileDir: root,
      config: { allowedUserIds: [1], allowedRoots: [root], pins: [project], recent: [] },
      api: {
        async sendMessage(_chatId, text) { sent.push(text); },
        async answerCallback() {},
      },
      openSession() {
        return {
          async prompt(text) { prompts.push(text); },
          async cancel() {},
          stop() {},
        };
      },
    });
  }
  const first = make();
  await first.handleUpdate({
    callback_query: { id: 'q', data: 'p:0', from: { id: 1 }, message: { chat: { id: 9 } } },
  });
  const second = make();
  await second.handleUpdate({
    message: { text: 'привет', from: { id: 1 }, chat: { id: 9 } },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sent.some((text) => text.startsWith('Сначала выберите проект')), false);
  assert.equal(prompts.includes('привет'), true);
});

test('choosing a project confirms before the waiting greeting', () => {
  const asked = decide(initialChat(), { type: 'text', text: 'привет', allowed: true }, {
    projects: [{ label: 'app', path: '/work/app' }],
  });
  const picked = decide(asked.state, { type: 'callback', data: 'p:0', allowed: true }, {
    resolvePath: () => ({ ok: true, path: '/work/app' }),
  });
  const replyAt = picked.effects.findIndex((effect) => effect.type === 'reply' && String(effect.text).startsWith('Проект:'));
  const promptAt = picked.effects.findIndex((effect) => effect.type === 'prompt');
  assert.equal(replyAt >= 0 && replyAt < promptAt, true);
  assert.equal(picked.effects.find((effect) => effect.type === 'prompt').text, 'привет');
});

test('slash opens the command menu and thinking is shown', () => {
  assert.equal(parseIncoming('/').name, 'commands');
  assert.equal(parseIncoming('/capture_model').kind, 'overlay');
  assert.equal(parseIncoming('/capture_model').name, 'capture-model');
  assert.deepEqual(formatTurn({ answer: 'ответ', thought: 'думал' }), ['Рассуждение:\nдумал', 'ответ']);
  const opened = decide(withProject(), { type: 'text', text: '/', allowed: true });
  const keyboard = opened.effects.find((effect) => effect.keyboard)?.keyboard?.flat() || [];
  assert.equal(keyboard.some((button) => button.data === 'cmd:mode'), true);
});

test('telegram buttons use callback_data', () => {
  const markup = telegramReplyMarkup([[{ text: 'Статус', data: 'nav:status' }]]);
  assert.deepEqual(markup.inline_keyboard, [[{ text: 'Статус', callback_data: 'nav:status' }]]);
});

test('every closed command list is available as buttons', () => {
  const names = [
    'mode', 'taskmode', 'anon', 'approve', 'learning', 'sdlc', 'litemode', 'uitests',
    'previewmode', 'caveman', 'economymode', 'rulesmodel', 'capture-model', 'session-rotate',
    'theme', 'mcpconfig', 'init',
  ];
  assert.deepEqual(Object.keys(OVERLAYS), names);
  const wide = choiceView('Список', 'intro', Array.from({ length: 7 }, (_item, index) => ({
    value: String(index),
    label: `пункт ${index}`,
    description: 'описание',
  })));
  assert.equal(wide.keyboard.some((row) => row.some((button) => button.data === 'pg:1')), true);
});

test('an open text prompt takes the next message and does not start a turn', () => {
  const state = withProject({ busy: true, dialog: { kind: 'input', source: 'pi' } });
  const answered = decide(state, { type: 'text', text: 'имя модели', allowed: true });
  assert.deepEqual(answered.effects[0], { type: 'resolve-pi', answer: { value: 'имя модели' } });
  assert.equal(answered.effects.some((effect) => effect.type === 'prompt'), false);
});

test('/mode opens buttons and does not cancel or prompt by itself', () => {
  const opened = decide(withProject(), { type: 'text', text: '/mode', allowed: true });
  assert.equal(opened.effects.some((effect) => effect.type === 'prompt'), false);
  assert.equal(opened.effects.some((effect) => effect.type === 'resolve-pi'), false);
  const labels = opened.state.dialog.options.map((option) => option.value);
  assert.deepEqual(labels, ['build', 'plan', 'ask']);
  const picked = decide(opened.state, { type: 'callback', data: 'o:0', allowed: true });
  assert.equal(picked.effects.find((effect) => effect.type === 'prompt').text, '/mode build');
  assert.equal(picked.state.mode, 'build');
  const direct = decide(withProject(), { type: 'text', text: '/mode build', allowed: true });
  assert.equal(direct.state.dialog, null);
  assert.equal(direct.effects.find((effect) => effect.type === 'prompt').text, '/mode build');
});

test('empty /init asks for a source and then a mode', () => {
  const opened = decide(withProject(), { type: 'text', text: '/init', allowed: true });
  assert.equal(opened.effects.some((effect) => effect.type === 'prompt'), false);
  const source = decide(opened.state, { type: 'callback', data: 'o:0', allowed: true });
  assert.equal(source.state.dialog.purpose, 'init-mode');
  assert.equal(source.effects.some((effect) => effect.type === 'prompt'), false);
  const mode = decide(source.state, { type: 'callback', data: 'o:0', allowed: true });
  assert.equal(mode.effects.find((effect) => effect.type === 'prompt').text, '/init empty standard');
});

test('/doctor is forwarded unchanged when a project is selected', () => {
  const result = decide(withProject(), { type: 'text', text: '/doctor', allowed: true });
  assert.equal(result.effects.find((effect) => effect.type === 'prompt').text, '/doctor');
});

test('text during a choice does not start a turn, and a repeated callback is ignored', () => {
  const opened = decide(withProject(), { type: 'text', text: '/approve', allowed: true });
  const blocked = decide(opened.state, { type: 'text', text: 'просто текст', allowed: true });
  assert.match(blocked.effects[0].text, /закончите выбор/);
  assert.equal(blocked.effects.some((effect) => effect.type === 'prompt'), false);
  const stale = decide(withProject(), { type: 'callback', data: 'o:0', allowed: true });
  assert.equal(stale.effects.length, 0);
  assert.equal(stale.state.project, '/work/app');
});

test('switching project during a turn waits for confirmation', () => {
  const state = withProject({ busy: true });
  const asked = decide(state, { type: 'text', text: '/work/other', allowed: true }, {
    resolvePath: () => ({ ok: true, path: '/work/other' }),
  });
  assert.equal(asked.state.project, '/work/app');
  assert.equal(asked.state.dialog.purpose, 'switch');
  const accepted = decide(asked.state, { type: 'callback', data: 'ok', allowed: true });
  assert.equal(accepted.state.project, '/work/other');
  assert.equal(accepted.effects.some((effect) => effect.type === 'abort'), true);
  const cancelled = decide(asked.state, { type: 'callback', data: 'no', allowed: true });
  assert.equal(cancelled.state.project, '/work/app');
  assert.equal(cancelled.effects.some((effect) => effect.type === 'open'), false);
});

test('restore and update do nothing until the named confirmation', () => {
  const backups = decide(initialChat(), { type: 'callback', data: 'bak:0', allowed: true });
  const listed = { ...initialChat(), backups: [{ name: 'settings-1.json', full: '/tmp/settings-1.json' }] };
  const asked = decide(listed, { type: 'callback', data: 'bak:0', allowed: true });
  assert.equal(asked.effects.some((effect) => effect.type === 'panel'), false);
  const cancelled = decide(asked.state, { type: 'callback', data: 'no', allowed: true });
  assert.equal(cancelled.effects.some((effect) => effect.op === 'restore'), false);
  const update = decide(initialChat(), { type: 'callback', data: 'upd:models', allowed: true });
  assert.equal(update.effects.some((effect) => effect.op === 'update'), false);
  const confirmed = decide(update.state, { type: 'callback', data: 'ok', allowed: true });
  assert.equal(confirmed.effects.find((effect) => effect.type === 'panel').op, 'update');
  assert.deepEqual(confirmed.effects.find((effect) => effect.type === 'panel').action.args, ['update', '--models']);
  void backups;
});

test('status is available before a project is chosen', () => {
  const result = decide(initialChat(), { type: 'text', text: '/status', allowed: true });
  assert.equal(result.effects[0].op, 'status');
  assert.equal(result.effects.some((effect) => effect.type === 'prompt'), false);
  const task = decide(initialChat(), { type: 'text', text: 'сделай отчёт', allowed: true });
  assert.match(task.effects[0].text, /выберите проект/);
  assert.equal(task.effects.some((effect) => effect.type === 'prompt'), false);
});

test('invalid settings.json is not rewritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-settings-'));
  const paths = profilePaths(dir, { PI_1C_BACKUP_DIR: path.join(dir, 'backups'), PI_CODING_AGENT_SESSION_DIR: path.join(dir, 'sessions') });
  fs.writeFileSync(paths.settingsJson, '{');
  const result = applyModel(paths, { provider: 'demo', model: 'demo', level: 'low' });
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(paths.settingsJson, 'utf8'), '{');
});

test('rpc session without a dialog handler cancels the overlay', async () => {
  const child = fakeChild();
  createRpcSession({
    spawnImpl: () => child,
    cwd: '/tmp',
    profileDir: '/tmp',
  });
  child.stdout.emit('data', `${JSON.stringify({
    type: 'extension_ui_request',
    id: 'ui-1',
    method: 'select',
    title: 'Режим',
    options: ['ask', 'plan', 'build'],
  })}\n`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const written = child.stdin.chunks.join('');
  assert.match(written, /"cancelled":true/);
  assert.equal(written.includes('"value"'), false);
});

test('poll retries a network error and does not listen', async () => {
  const source = fs.readFileSync(new URL('../../packages/pi-1c-telegram/lib/poll.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('createServer'), false);
  assert.equal(source.includes('.listen('), false);
  assert.match(source, /getUpdates/);
  let calls = 0;
  const controller = new AbortController();
  const seen = [];
  await pollLoop({
    token: 'test-token',
    signal: controller.signal,
    sleep: async () => {},
    log(line) { seen.push(line); },
    async fetchImpl() {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      controller.abort();
      return { ok: true, json: async () => ({ ok: true, result: [{ update_id: 4 }] }) };
    },
    async onUpdates(updates) {
      assert.equal(updates[0].update_id, 4);
    },
  });
  assert.equal(calls, 2);
  assert.equal(seen.some((line) => line.includes('test-token')), false);
});

test('long text is split and secrets are redacted before send', async () => {
  assert.equal(chunkText('a'.repeat(4001)).length, 2);
  const cleaned = redactOutgoing('password=supersecretvalue', os.tmpdir());
  assert.equal(cleaned.text.includes('supersecretvalue'), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-redact-'));
  const project = path.join(dir, 'app');
  fs.mkdirSync(project);
  const sent = [];
  const gateway = createGateway({
    profileDir: dir,
    config: { allowedUserIds: [1], allowedRoots: [dir], pins: [project], recent: [] },
    api: {
      async sendMessage(_chatId, text) { sent.push(text); },
      async answerCallback() {},
    },
    openSession(options) {
      return {
        async prompt() {
          options.onEvent({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'password=supersecretvalue' },
          });
        },
        async cancel() {},
        stop() {},
      };
    },
  });
  await gateway.handleUpdate({ message: { text: project, from: { id: 1 }, chat: { id: 9 } } });
  await gateway.handleUpdate({ message: { text: 'посмотри модуль', from: { id: 1 }, chat: { id: 9 } } });
  assert.equal(sent.some((text) => text.includes('supersecretvalue')), false);
  assert.equal(sent.some((text) => text.includes('[REDACTED:')), true);
});

test('token file is tightened to owner read-write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-token-'));
  const file = path.join(dir, 'bot.token');
  fs.writeFileSync(file, '123\n', { mode: 0o644 });
  assert.equal(tightenTokenFile(file), true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('config save does not keep a bot token field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-cfg-'));
  saveConfig(dir, { allowedUserIds: [5], allowedRoots: ['/work'], pins: [], recent: [], token: 'should-not-stick' });
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state', 'telegram', 'config.json'), 'utf8'));
  assert.equal(Object.hasOwn(saved, 'token'), false);
  assert.deepEqual(saved.allowedUserIds, [5]);
});

test('a pinned path is stored under its parent root and shown by name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pins-'));
  const parent = path.join(dir, 'client');
  const project = path.join(parent, 'app');
  fs.mkdirSync(project, { recursive: true });
  const pinned = pinPath({ allowedUserIds: [], allowedRoots: [], pins: [], recent: [] }, project);
  assert.equal(pinned.ok, true);
  assert.equal(pinned.config.pins.length, 1);
  assert.equal(pinned.config.allowedRoots.length, 1);
  const listed = projectList(pinned.config);
  assert.equal(listed[0].label, 'client / app');
  assert.equal(listed[0].path, fs.realpathSync(project));
  const removed = removePin(pinned.config, 'client / app');
  assert.equal(removed.ok, true);
  assert.equal(removed.config.pins.length, 0);
});

test('agent setup stores a token without echoing it and pins the current directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-setup-'));
  const project = path.join(dir, 'app');
  fs.mkdirSync(project);
  const saved = writeToken(dir, '123456:ABCDEF');
  assert.equal(saved.ok, true);
  assert.equal(saved.message.includes('123456:ABCDEF'), false);
  assert.equal(writeToken(dir, 'bad token').ok, false);
  const status = statusText({ config: { allowedUserIds: [], allowedRoots: [], pins: [] }, token: '123456:ABCDEF', running: false });
  assert.equal(status.includes('123456:ABCDEF'), false);
  assert.match(status, /…CDEF/);
  const here = useHere({ allowedUserIds: [], allowedRoots: [], pins: [], recent: [] }, project);
  assert.equal(here.ok, true);
  assert.equal(here.config.pins[0], fs.realpathSync(project));
  const missed = tryPair(here.config, '000000', 9, { code: '111111', expires: Date.now() + 1000 });
  assert.equal(missed.ok, false);
  const paired = tryPair(here.config, '111111', 9, { code: '111111', expires: Date.now() + 1000 });
  assert.deepEqual(paired.config.allowedUserIds, [9]);
});

test('a pairing code from the phone is saved and a wrong code is refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pair-'));
  const pairing = createPairing(dir, Date.now(), {});
  const sent = [];
  const gateway = createGateway({
    profileDir: dir,
    config: { allowedUserIds: [], allowedRoots: [], pins: [], recent: [] },
    api: {
      async sendMessage(_chatId, text) { sent.push(text); },
      async answerCallback() {},
    },
    openSession() { throw new Error('session must not start'); },
  });
  await gateway.handleUpdate({ message: { text: 'нет', from: { id: 42 }, chat: { id: 7 } } });
  assert.equal(sent.at(-1), REFUSAL);
  await gateway.handleUpdate({ message: { text: pairing.code, from: { id: 42 }, chat: { id: 7 } } });
  assert.match(sent.at(-1), /подключён/);
  assert.deepEqual(loadConfig(dir).allowedUserIds, [42]);
  assert.equal(gateway.opened, 0);
});

test('the bot process is not spawned twice and does not start without a token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-svc-'));
  const missing = startGateway(dir, { spawnImpl() { throw new Error('no token'); } });
  assert.equal(missing.ok, false);
  writeToken(dir, '123456:ABCDEF');
  let spawned = 0;
  const exists = (file) => String(file).endsWith('launch.mjs') || fs.existsSync(file);
  const started = startGateway(dir, {
    exists,
    spawnImpl() {
      spawned += 1;
      return { pid: 5151, unref() {} };
    },
    kill() {},
  });
  assert.equal(started.ok, true);
  assert.equal(spawned, 1);
  assert.match(fs.readFileSync(pidPath(dir), 'utf8'), /5151/);
  const again = startGateway(dir, {
    exists,
    spawnImpl() { spawned += 1; return { pid: 9, unref() {} }; },
    kill() {},
  });
  assert.equal(again.already, true);
  assert.equal(spawned, 1);
});

test('the ACP bridge still auto-cancels overlays', () => {
  const bridge = fs.readFileSync(path.join(root, 'packages', 'pi-1c-agent', 'lib', 'acp-bridge.mjs'), 'utf8');
  assert.match(bridge, /cancelled: true/);
  assert.equal(bridge.includes('onDialog'), false);
});

function fakeChild() {
  const stdin = new EventEmitter();
  stdin.writable = true;
  stdin.chunks = [];
  stdin.write = (chunk) => {
    stdin.chunks.push(String(chunk));
    return true;
  };
  stdin.end = () => {};
  const stdout = new EventEmitter();
  const child = new EventEmitter();
  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = new EventEmitter();
  child.kill = () => {};
  child.stdout.setEncoding = () => {};
  return child;
}
