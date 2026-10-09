import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';
import { listZipNames, writeClientBundle } from '../../scripts/lib/client-bundle.mjs';

const FORBIDDEN = [
  'tests/',
  'openspec/',
  'external-agent-sources/',
  '.github/',
  'packages/pi-1c-agent/tests/',
  'scripts/scan-public-tree.mjs',
  'scripts/export-public-repo.mjs',
  'scripts/package-client-bundle.mjs',
  'auth.json',
  'trust.json',
  '.dev.env',
];

test('client bundle keeps the runnable profile and drops maintainer trees', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-1c-client-'));
  const result = writeClientBundle(profileRoot(), { outDir });
  const names = listZipNames(fs.readFileSync(result.zipPath));
  assert.ok(names.includes('scripts/pi-1c'));
  assert.ok(names.includes('packages/pi-1c-agent/package.json'));
  assert.ok(names.includes('rules-1c/core/release-bundle.md'));
  assert.ok(names.includes('mcp.example.json'));
  assert.ok(names.includes('mcp.optional/memory-stack/secrets/routerai.env.example'));
  assert.equal(names.includes('mcp.optional/memory-stack/secrets/routerai.env'), false);
  for (const name of names) {
    for (const ban of FORBIDDEN) {
      const hit = ban.endsWith('/') ? name.startsWith(ban) || name.includes(`/${ban}`) : name === ban || name.endsWith(`/${ban}`);
      assert.equal(hit, false, `${name} matched forbidden ${ban}`);
    }
  }
  const sums = fs.readFileSync(result.sumsPath, 'utf8');
  assert.match(sums, /^[a-f0-9]{64}  pi-1c-agent-.+-client\.zip\n$/);
});
