import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { readCavemanDefault } from '../lib/skills.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('CAVEMAN shipped default is auto', () => {
  const root = profileRoot();
  const files = {
    skill: fs.readFileSync(path.join(root, 'skills', 'caveman', 'SKILL.md'), 'utf8'),
    catalog: fs.readFileSync(path.join(root, 'prompts', 'CATALOG.md'), 'utf8'),
    env: fs.readFileSync(path.join(root, 'rules-1c', 'rules', 'dev-standards-env.md'), 'utf8'),
    overlay: fs.readFileSync(path.join(root, 'rules-1c', 'AGENTS-UPSTREAM.md'), 'utf8'),
  };
  assert.equal(readCavemanDefault(files), 'auto');
});
