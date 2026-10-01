import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDevEnvKey, setDevEnvKey, setDevEnvKeys } from '../lib/dev-env-key.mjs';
import {
  parseCavemanArgs,
  parseEconomyArgs,
  parseLitemodeArgs,
  parsePreviewArgs,
  parseRulesmodelArgs,
  parseSdlcArgs,
  parseUitestsArgs,
} from '../lib/project-settings.mjs';

test('empty argument is pick; status does not set; known values set', () => {
  assert.equal(parseSdlcArgs('').kind, 'pick');
  assert.equal(parseSdlcArgs('status').kind, 'status');
  assert.deepEqual(parseSdlcArgs('lite'), { kind: 'set', depth: 'lite' });
  assert.equal(parseSdlcArgs('on').kind, 'invalid');

  assert.equal(parseLitemodeArgs('').kind, 'pick');
  assert.deepEqual(parseLitemodeArgs('on'), { kind: 'set', depth: 'lite' });
  assert.deepEqual(parseLitemodeArgs('off'), { kind: 'set', depth: 'standard' });

  assert.equal(parseUitestsArgs('').kind, 'pick');
  assert.deepEqual(parseUitestsArgs('on'), { kind: 'set', key: 'UI_TESTING', value: 'auto' });
  assert.deepEqual(parseUitestsArgs('hidden'), { kind: 'set', key: 'MCP_QA_CLIENT_VISIBLE', value: 'false' });

  assert.equal(parsePreviewArgs('').kind, 'pick');
  assert.equal(parsePreviewArgs('once').kind, 'once');
  assert.deepEqual(parsePreviewArgs('auto'), { kind: 'set', value: 'auto' });

  assert.equal(parseCavemanArgs('').kind, 'pick');
  assert.equal(parseCavemanArgs('ultra').persist, false);
  assert.equal(parseCavemanArgs('on').persist, true);

  assert.equal(parseEconomyArgs('').kind, 'pick');
  assert.deepEqual(parseEconomyArgs('on'), { kind: 'set', value: 'economy' });
  assert.equal(parseEconomyArgs('models').kind, 'models');
  assert.equal(parseEconomyArgs('rtk').kind, 'rtk');

  assert.equal(parseRulesmodelArgs('').kind, 'pick');
  assert.equal(parseRulesmodelArgs('auto').kind, 'pick');
  assert.deepEqual(parseRulesmodelArgs('gpt-6'), { kind: 'set', value: 'gpt6' });
  assert.deepEqual(parseRulesmodelArgs('off'), { kind: 'set', value: '' });
  assert.equal(parseRulesmodelArgs('haiku').kind, 'invalid');
});

test('setDevEnvKey rewrites one key and never creates the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-1c-env-'));
  assert.equal(setDevEnvKey(dir, 'VERIFICATION_DEPTH', 'lite').reason, 'missing');
  fs.writeFileSync(path.join(dir, '.dev.env'), 'FOO=bar\nVERIFICATION_DEPTH=standard\n');
  const written = setDevEnvKey(dir, 'VERIFICATION_DEPTH', 'lite');
  assert.equal(written.ok, true);
  const raw = fs.readFileSync(path.join(dir, '.dev.env'), 'utf8');
  assert.match(raw, /^VERIFICATION_DEPTH=lite$/m);
  assert.match(raw, /^FOO=bar$/m);
  assert.equal(readDevEnvKey(dir, 'VERIFICATION_DEPTH').value, 'lite');
  setDevEnvKeys(dir, {
    SUBAGENT_MODEL_CODING: { value: 'a' },
    SUBAGENT_MODEL_ANALYSIS: { value: 'b' },
  });
  const after = fs.readFileSync(path.join(dir, '.dev.env'), 'utf8');
  assert.match(after, /SUBAGENT_MODEL_CODING=a/);
  assert.match(after, /SUBAGENT_MODEL_ANALYSIS=b/);
});
