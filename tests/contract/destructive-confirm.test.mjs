import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DESTRUCTIVE_PROMPT_NAMES, requiresTargetConfirmation } from '../lib/commands.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('destructive infobase prompts require target confirmation', () => {
  const promptsDir = path.join(profileRoot(), 'prompts');
  for (const name of DESTRUCTIVE_PROMPT_NAMES) {
    const filePath = path.join(promptsDir, `${name}.md`);
    assert.ok(fs.existsSync(filePath), `${filePath} missing`);
    const md = fs.readFileSync(filePath, 'utf8');
    assert.ok(
      requiresTargetConfirmation(md),
      `${filePath} must contain "## Confirm the target infobase" and wait for explicit confirmation`,
    );
  }
});
