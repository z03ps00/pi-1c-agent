import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';

const SEEDED_PIN = 'c1fb8e687be5b9d71d5a05c6f5d32cf6a6919dcb';

test('upstream.lock.json carries the applied pin', () => {
  const lockPath = path.join(profileRoot(), 'upstream.lock.json');
  assert.ok(fs.existsSync(lockPath), `${lockPath} missing`);
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(lock.lastAppliedSha, SEEDED_PIN, `${lockPath} lastAppliedSha`);
  assert.equal(lock.lastReviewedSha, SEEDED_PIN, `${lockPath} lastReviewedSha`);
});
