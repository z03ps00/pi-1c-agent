import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  FORBIDDEN_PROMPT_NAMES,
  findPromptFiles,
  parseCommandTitle,
  prefixedPromptFiles,
} from '../lib/commands.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('no help/plan/build/debug prompt files', () => {
  const promptsDir = path.join(profileRoot(), 'prompts');
  for (const name of FORBIDDEN_PROMPT_NAMES) {
    const hits = [`${name}.md`, `1c-${name}.md`].filter((n) => fs.existsSync(path.join(promptsDir, n)));
    assert.deepEqual(hits, [], `forbidden prompt files exist: ${hits.join(', ')}`);
  }
});

test('no /1c-* prompt files; remaining titles are unprefixed', () => {
  const promptsDir = path.join(profileRoot(), 'prompts');
  const prefixed = prefixedPromptFiles(promptsDir).map((f) => path.basename(f));
  assert.deepEqual(prefixed, [], `prefixed prompt files must not exist: ${prefixed.join(', ')}`);

  const canonical = [];
  for (const filePath of findPromptFiles(promptsDir)) {
    const md = fs.readFileSync(filePath, 'utf8');
    const title = parseCommandTitle(md);
    const base = path.basename(filePath, '.md');
    assert.ok(
      title && title.startsWith('/') && !title.startsWith('/1c-'),
      `${filePath} title must be unprefixed, got ${title}`,
    );
    canonical.push(base);
  }
  assert.ok(canonical.includes('commands'), 'prompts/commands.md missing');
  assert.ok(canonical.includes('installmcp'), 'prompts/installmcp.md missing');
  assert.ok(!canonical.includes('init'), 'prompts/init.md must not exist (package owns /init)');
  assert.ok(!canonical.includes('doctor'), 'prompts/doctor.md must not exist (package owns /doctor)');
});
