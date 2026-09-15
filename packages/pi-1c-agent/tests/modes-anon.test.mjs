import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMachineLocalPathHits } from '../lib/product-health.mjs';
import { resolveAnonPendingRoot, resolveAnonHandoffRoots } from '../lib/plan-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(mjs|ts|md)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

test('shipped lib/ and extensions/ contain no foreign absolute paths', () => {
  const files = [
    ...walk(path.join(root, 'lib')),
    ...walk(path.join(root, 'extensions')),
  ].filter((p) => path.basename(p) !== 'product-health.mjs' && path.basename(p) !== 'docker-policy.mjs');
  const hits = [];
  for (const file of files) {
    const found = findMachineLocalPathHits(fs.readFileSync(file, 'utf8'));
    for (const hit of found) hits.push(`${path.relative(root, file)}:${hit}`);
  }
  assert.deepEqual(hits, []);
});

test('anon roots resolve from PI_CODING_AGENT_DIR and project-relative handoffs', () => {
  const prev = process.env.PI_CODING_AGENT_DIR;
  const profile = path.join(root, 'tmp-profile-does-not-need-to-exist');
  process.env.PI_CODING_AGENT_DIR = profile;
  try {
    const pending = resolveAnonPendingRoot();
    assert.equal(pending, path.resolve(profile, 'state', 'agent-memory', 'pending'));
    assert.equal(pending.includes(path.sep + 'mnt' + path.sep + 'vol_'), false);
    const cwd = path.join(root, 'example-project');
    const handoffs = resolveAnonHandoffRoots(cwd);
    assert.ok(handoffs.includes(path.resolve(cwd, 'handoffs')));
    assert.ok(handoffs.every((p) => p.startsWith(path.resolve(cwd))));
  } finally {
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  }
});
