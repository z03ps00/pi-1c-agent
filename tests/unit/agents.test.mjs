import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  hasJsonHandoffBlock,
  markdownOnlyHandoffRequired,
} from '../lib/agents.mjs';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'agents');

test('hasJsonHandoffBlock: compliant JSON contract', () => {
  const md = fs.readFileSync(path.join(fixtures, 'handoff-json.md'), 'utf8');
  assert.equal(hasJsonHandoffBlock(md), true);
  assert.equal(markdownOnlyHandoffRequired(md), false);
});

test('hasJsonHandoffBlock: markdown-only is not the JSON contract', () => {
  const md = fs.readFileSync(path.join(fixtures, 'handoff-markdown-only.md'), 'utf8');
  assert.equal(hasJsonHandoffBlock(md), false);
  assert.equal(markdownOnlyHandoffRequired(md), true);
});
