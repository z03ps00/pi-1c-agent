import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { testsRoot, walkFiles } from '../lib/profile-root.mjs';

test('write-effect tests go through temp copies; none target a real .dev.env or project', () => {
  const files = walkFiles(testsRoot(), (p) => p.endsWith('.test.mjs') || p.endsWith('.mjs'));
  for (const filePath of files) {
    const rel = path.relative(testsRoot(), filePath);
    const src = fs.readFileSync(filePath, 'utf8');
    if (rel.endsWith('isolation.test.mjs')) continue;
    assert.doesNotMatch(
      src,
      /readFileSync\([^)]*\.dev\.env/,
      `${rel} must not read a real .dev.env`,
    );
    assert.doesNotMatch(
      src,
      /writeFileSync\([^)]*\.dev\.env/,
      `${rel} must not write a real .dev.env`,
    );
    if (/writeFileSync|fs\.cpSync|fs\.rmSync/.test(src) && !rel.startsWith(`lib${path.sep}`)) {
      assert.match(
        src,
        /withTemp(Dir|ProfileCopy|Workspace)/,
        `${rel} writes the filesystem without withTempProfileCopy / withTempWorkspace / withTempDir`,
      );
    }
  }
});
