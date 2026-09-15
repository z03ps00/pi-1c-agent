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

test('AGENTS.md header tells the agent to install from scratch or update in place', () => {
  const agentsPath = path.join(profileRoot(), 'AGENTS.md');
  const text = fs.readFileSync(agentsPath, 'utf8');
  assert.match(text, /## This profile: install or update/);
  assert.match(text, /scripts\/setup\.mjs/);
  assert.match(text, /\/update-profile/);
  assert.match(text, /run the matching steps/i);
  assert.match(text, /Do not send the user to copy a package from another machine/);
});
