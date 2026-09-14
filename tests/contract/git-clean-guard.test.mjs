import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { withTempProfileCopy } from '../lib/fsutil.mjs';
import { gitPorcelain } from '../lib/git.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('temp profile writes do not change git status of the real tree', async () => {
  const before = gitPorcelain();
  await withTempProfileCopy(async (profileDir) => {
    fs.writeFileSync(path.join(profileDir, 'mcp.json'), '{"mcpServers":{"memory":{}}}\n');
    fs.writeFileSync(path.join(profileDir, 'scratch.txt'), 'temp\n');
  });
  const after = gitPorcelain();
  assert.deepEqual(after, before);
  assert.ok(fs.existsSync(path.join(profileRoot(), 'mcp.json')));
});
