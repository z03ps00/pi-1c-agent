import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readCavemanDefault, readSkillFrontmatter } from '../lib/skills.mjs';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'skills');

test('readSkillFrontmatter: compliant skill header', () => {
  const md = fs.readFileSync(path.join(fixtures, 'frontmatter-good.md'), 'utf8');
  const fm = readSkillFrontmatter(md);
  assert.equal(fm.name, 'vanessa-mcp');
  assert.ok(fm.description);
});

test('readSkillFrontmatter: missing header is empty', () => {
  const md = fs.readFileSync(path.join(fixtures, 'frontmatter-bad.md'), 'utf8');
  assert.deepEqual(readSkillFrontmatter(md), {});
});

test('readCavemanDefault: auto vs on', () => {
  const auto = fs.readFileSync(path.join(fixtures, 'caveman-auto.md'), 'utf8');
  const on = fs.readFileSync(path.join(fixtures, 'caveman-on.md'), 'utf8');
  assert.equal(readCavemanDefault({ good: auto }), 'auto');
  assert.equal(readCavemanDefault({ bad: on }), 'on');
});
