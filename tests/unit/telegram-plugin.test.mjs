import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REFUSAL, accessDecision, saveConfig, tightenTokenFile } from '../../packages/pi-1c-telegram/lib/config.mjs';
import { chunkText, redactOutgoing } from '../../packages/pi-1c-telegram/lib/format.mjs';
import { createGateway } from '../../packages/pi-1c-telegram/lib/gateway.mjs';
import { applyModel, profilePaths } from '../../packages/pi-1c-telegram/lib/panel.mjs';
import { pollLoop } from '../../packages/pi-1c-telegram/lib/poll.mjs';
import { acceptProject } from '../../packages/pi-1c-telegram/lib/projects.mjs';
import { createRpcSession } from '../../packages/pi-1c-telegram/lib/rpc-session.mjs';
import { OVERLAYS } from '../../packages/pi-1c-telegram/lib/choices.mjs';
import { choiceView } from '../../packages/pi-1c-telegram/lib/menus.mjs';
import { decide, initialChat } from '../../packages/pi-1c-telegram/lib/router.mjs';
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
