import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applySettingsObject,
  expandProjectPath,
  jsonValidate,
  parseModelCatalog,
  resolveProfileDir,
  resolveSessionDir,
} from '../../scripts/lib/pi-1c-ctl-lib.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('expandProjectPath keeps trailing space and expands ~', () => {
  assert.equal(expandProjectPath('~/work', { homedir: '/tmp/u' }), '/tmp/u/work');
  assert.equal(expandProjectPath('~', { homedir: '/tmp/u' }), '/tmp/u');
  assert.equal(expandProjectPath('"/tmp/proj "', { homedir: '/tmp/u' }), '/tmp/proj ');
  assert.equal(expandProjectPath('', { homedir: '/tmp/u' }), '');
});

test('applySettingsObject keeps or removes thinking', () => {
  const base = { defaultProvider: 'a', defaultModel: 'b', defaultThinkingLevel: 'low' };
  assert.equal(applySettingsObject(base, 'x', 'y', '__KEEP__').defaultThinkingLevel, 'low');
  assert.equal(applySettingsObject(base, 'x', 'y', '__REMOVE__').defaultThinkingLevel, undefined);
  assert.equal(applySettingsObject(base, 'x', 'y', 'high').defaultThinkingLevel, 'high');
});

test('parseModelCatalog skips the header line', () => {
  const rows = parseModelCatalog('provider model\nopenai-codex gpt-5.5\n\ndeepseek deepseek-v4-flash\n');
  assert.deepEqual(rows, [
    { provider: 'openai-codex', model: 'gpt-5.5' },
    { provider: 'deepseek', model: 'deepseek-v4-flash' },
  ]);
});

test('resolveProfileDir and session dir prefer env', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-ctl-'));
  const sessions = path.join(tmp, 'sessions');
  fs.mkdirSync(sessions);
  assert.equal(resolveProfileDir({ env: { PI_CODING_AGENT_DIR: tmp }, scriptDir: '/unused' }), tmp);
  assert.equal(resolveSessionDir({ env: {}, profileDir: tmp }), sessions);
  assert.equal(
    resolveSessionDir({ env: { PI_CODING_AGENT_SESSION_DIR: '/tmp/pi-sessions' }, profileDir: tmp }),
    path.resolve('/tmp/pi-sessions'),
  );
});

test('jsonValidate accepts object JSON only', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-json-'));
  const ok = path.join(tmp, 'ok.json');
  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(ok, '{"a":1}\n');
  fs.writeFileSync(bad, '{');
  assert.equal(jsonValidate(ok), true);
  assert.equal(jsonValidate(bad), false);
});

test('desktop shortcut template launches the in-repo panel', () => {
  const desktop = fs.readFileSync(path.join(profileRoot(), 'scripts', 'Pi-1C-Agent.desktop.in'), 'utf8');
  assert.match(desktop, /Панель управления Pi 1C Agent/);
  assert.match(desktop, /@PI_1C_CTL@/);
  assert.match(desktop, /Terminal=true/);
  assert.doesNotMatch(desktop, /@PI_1C_LAUNCHER@/);
});
