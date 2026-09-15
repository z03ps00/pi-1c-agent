import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  classifyCatalogSection,
  findPromptFiles,
  parseCommandTitle,
  prefixedPromptFiles,
} from '../lib/commands.mjs';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'prompts');

test('parseCommandTitle: unprefixed canonical title', () => {
  const md = fs.readFileSync(path.join(fixtures, 'title-good.md'), 'utf8');
  assert.equal(parseCommandTitle(md), '/installmcp');
});

test('parseCommandTitle: prefixed title is visible', () => {
  const md = fs.readFileSync(path.join(fixtures, 'title-bad.md'), 'utf8');
  assert.equal(parseCommandTitle(md), '/1c-installmcp');
});

test('classifyCatalogSection: everyday / settings / maintainer', () => {
  const catalog = fs.readFileSync(path.join(fixtures, 'catalog.md'), 'utf8');
  assert.equal(classifyCatalogSection(catalog, 'commands'), 'everyday');
  assert.equal(classifyCatalogSection(catalog, '/installmcp'), 'settings');
  assert.equal(classifyCatalogSection(catalog, 'review-airules'), 'maintainer');
  assert.equal(classifyCatalogSection(catalog, 'help'), null);
});

test('findPromptFiles lists markdown except CATALOG.md', () => {
  const files = findPromptFiles(fixtures);
  assert.ok(files.some((f) => f.endsWith('title-good.md')));
  assert.ok(!files.some((f) => path.basename(f) === 'catalog.md') || files.some((f) => f.endsWith('catalog.md')));
  const names = files.map((f) => path.basename(f));
  assert.ok(!names.includes('CATALOG.md'));
});

test('prefixedPromptFiles lists only 1c-*.md names', () => {
  const names = prefixedPromptFiles(fixtures).map((f) => path.basename(f));
  assert.deepEqual(names, ['1c-dummy.md']);
});
