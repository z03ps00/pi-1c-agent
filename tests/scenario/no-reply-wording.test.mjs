import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { testsRoot, walkFiles } from '../lib/profile-root.mjs';

test('scenario tests never assert exact reply wording', () => {
  const scenarioDir = path.join(testsRoot(), 'scenario');
  const files = walkFiles(scenarioDir, (p) => p.endsWith('.test.mjs') && !p.endsWith('no-reply-wording.test.mjs'));
  const forbidden = [
    /assert\.(?:equal|match|strictEqual)\([^)]*reply/i,
    /exact (?:reply|wording|phrasing|sentence)/i,
    /model produced/,
    /assert\.equal\(\s*text,\s*['"`]/,
  ];
  for (const filePath of files) {
    const src = fs.readFileSync(filePath, 'utf8');
    for (const re of forbidden) {
      assert.ok(!re.test(src), `${filePath} appears to assert reply wording (${re})`);
    }
  }
});
