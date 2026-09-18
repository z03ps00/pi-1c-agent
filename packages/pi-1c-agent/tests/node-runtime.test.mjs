import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_NODE_VERSION, assertNodeVersion, nodeMeetsMinimum } from '../lib/node-runtime.mjs';

const rootPkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

test('Node below minimum fails with a clear message', () => {
  const result = assertNodeVersion('v20.11.0', MIN_NODE_VERSION);
  assert.equal(result.ok, false);
  assert.match(result.message, /Node >=22\.19\.0/);
  assert.match(result.message, /v20\.11\.0/);
});

test('profile and package advertise the same Node minimum', () => {
  assert.equal(pkg.engines.node, `>=${MIN_NODE_VERSION}`);
  assert.equal(rootPkg.engines.node, `>=${MIN_NODE_VERSION}`);
  assert.equal(nodeMeetsMinimum('v22.19.0'), true);
});

test('peer dependencies are bounded ranges', () => {
  for (const [name, range] of Object.entries(pkg.peerDependencies)) {
    assert.notEqual(range, '*', name);
    assert.match(String(range), /[<>]|>=|~|\^/, name);
  }
});
