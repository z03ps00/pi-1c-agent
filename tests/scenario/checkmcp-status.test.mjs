import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';

test('/checkmcp default is status-only; repair path is explicit', () => {
  const md = fs.readFileSync(path.join(profileRoot(), 'prompts', 'checkmcp.md'), 'utf8');
  assert.match(md, /status-only/);
  assert.match(md, /Do \*\*not\*\* install, start, or `docker run` anything/);
  assert.match(md, /\/checkmcp repair/);
  assert.match(md, /Repair\/start\/install runs only when the user asked for `repair`/);
});
