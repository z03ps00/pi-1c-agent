import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { classifyCatalogSection } from '../lib/commands.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('/review-airules exists and is classified maintainer', () => {
  const root = profileRoot();
  const promptPath = path.join(root, 'prompts', 'review-airules.md');
  assert.ok(fs.existsSync(promptPath), `${promptPath} missing`);
  const catalog = fs.readFileSync(path.join(root, 'prompts', 'CATALOG.md'), 'utf8');
  const commands = fs.readFileSync(path.join(root, 'prompts', 'commands.md'), 'utf8');
  assert.equal(
    classifyCatalogSection(catalog, 'review-airules'),
    'maintainer',
    'CATALOG.md must list /review-airules under Maintainer',
  );
  assert.equal(
    classifyCatalogSection(catalog, 'session-rotate'),
    'settings',
    'CATALOG.md must list /session-rotate under Settings',
  );
  assert.match(commands, /review-airules/);
  assert.match(commands, /maintainer/i);
});
