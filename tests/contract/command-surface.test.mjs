import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  FORBIDDEN_PROMPT_NAMES,
  findPromptFiles,
  isAliasPromptFile,
  isAliasStub,
  parseCommandTitle,
} from '../lib/commands.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('no help/plan/build/debug prompt files', () => {
  const promptsDir = path.join(profileRoot(), 'prompts');
  for (const name of FORBIDDEN_PROMPT_NAMES) {
    const hits = [`${name}.md`, `1c-${name}.md`].filter((n) => fs.existsSync(path.join(promptsDir, n)));
    assert.deepEqual(hits, [], `forbidden prompt files exist: ${hits.join(', ')}`);
  }
});

test('canonical prompt titles are unprefixed; /1c-* alias stubs exist', () => {
  const promptsDir = path.join(profileRoot(), 'prompts');
  const files = findPromptFiles(promptsDir);
  const aliases = [];
  const canonical = [];
  for (const filePath of files) {
    const md = fs.readFileSync(filePath, 'utf8');
    const title = parseCommandTitle(md);
    const base = path.basename(filePath, '.md');
    if (isAliasPromptFile(filePath)) {
      aliases.push(base);
      assert.ok(isAliasStub(md), `${filePath} must be a /1c-* alias stub`);
      assert.ok(title && title.startsWith('/1c-'), `${filePath} title must be /1c-*: ${title}`);
    } else {
      canonical.push(base);
      assert.ok(title && title.startsWith('/') && !title.startsWith('/1c-'), `${filePath} title must be unprefixed, got ${title}`);
    }
  }
  assert.ok(canonical.includes('commands'), 'prompts/commands.md missing');
  assert.ok(canonical.includes('installmcp'), 'prompts/installmcp.md missing');
  for (const name of canonical) {
    assert.ok(aliases.includes(`1c-${name}`), `missing alias stub prompts/1c-${name}.md`);
  }
});
