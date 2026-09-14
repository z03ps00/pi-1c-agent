import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';

test('AGENTS.md overlay has PI-1C-AGENT markers and no global docker ban', () => {
  const agentsPath = path.join(profileRoot(), 'AGENTS.md');
  const text = fs.readFileSync(agentsPath, 'utf8');
  assert.match(text, /<!-- PI-1C-AGENT:BEGIN -->/);
  assert.match(text, /<!-- PI-1C-AGENT:END -->/);
  assert.doesNotMatch(text, /never run docker/i);
  assert.doesNotMatch(text, /must never run docker/i);
  assert.doesNotMatch(text, /never docker/i);
  assert.match(text, /Docker \/ Podman is a product capability/);
});
