import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';

test('PLAN decision text permits only planning artifacts and protects project code', () => {
  const root = profileRoot();
  const overlay = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const modes = fs.readFileSync(path.join(root, 'rules-1c', 'core', 'modes.md'), 'utf8');
  for (const [label, text] of [['AGENTS.md', overlay], ['modes.md', modes]]) {
    assert.match(text, /openspec\/\*\*/, `${label} must allow openspec/**`);
    assert.match(text, /\.pi\/1c\/plans\/\*\*/, `${label} must allow .pi/1c/plans/**`);
    assert.match(text, /\.pi\/1c\/knowledge-drafts\/\*\*/, `${label} must allow .pi/1c/knowledge-drafts/**`);
  }
  assert.match(overlay, /PLAN protects project code/);
  assert.match(modes, /Project code and state are protected/);
});
