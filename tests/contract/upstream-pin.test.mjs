import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';

const SEEDED_PIN = '410951e74fd3e6b7a763cf49757935b9a34d3f31';

test('upstream.lock.json carries the seeded pin', () => {
  const lockPath = path.join(profileRoot(), 'upstream.lock.json');
  assert.ok(fs.existsSync(lockPath), `${lockPath} missing`);
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(lock.lastAppliedSha, SEEDED_PIN, `${lockPath} lastAppliedSha`);
  assert.equal(lock.lastReviewedSha, SEEDED_PIN, `${lockPath} lastReviewedSha`);
});
