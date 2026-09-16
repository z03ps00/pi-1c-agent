import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  FORBIDDEN_PROMPT_NAMES,
  PACKAGE_OWNED_COMMANDS,
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
  for (const name of PACKAGE_OWNED_COMMANDS) {
    assert.ok(
      !canonical.includes(name),
      `prompts/${name}.md must not exist (pi-1c-agent owns /${name})`,
    );
  }
});

const FORBIDDEN_PREFIXED_COMMAND = /\/1c-(learn|config|rule|init|doctor|mode|anon|approve|wrap|agents|memory-flush|bootstrap|openspec-setup|agent-scope|session-rotate|capture-model)\b/g;

function walkFiles(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, exts, acc);
    else if (exts.some((ext) => ent.name.endsWith(ext))) acc.push(p);
  }
  return acc;
}

test('package skills/rules/lib do not teach /1c-* command names', () => {
  const pkg = path.join(profileRoot(), 'packages', 'pi-1c-agent');
  const files = [
    ...walkFiles(path.join(pkg, 'skills'), ['.md']),
    ...walkFiles(path.join(pkg, 'rules'), ['.md']),
    ...walkFiles(path.join(pkg, 'lib'), ['.mjs']),
  ];
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(FORBIDDEN_PREFIXED_COMMAND);
    if (matches) hits.push(`${path.relative(pkg, file)}: ${[...new Set(matches)].join(', ')}`);
  }
  assert.deepEqual(hits, [], hits.join('\n'));
});
