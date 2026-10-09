import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { profileRoot } from '../lib/profile-root.mjs';

const NEW_COMMANDS = ['groups', 'layout-view', 'reglog', 'ext-plan'];
const ROOTS = ['bsl', 'formshot', 'journal', 'merge', 'deslop', 'borrow', 'preview', 'graph', 'index', 'meta', 'sync', 'fresh', 'process', 'ready', 'document'];
const FOREIGN = [
  'preview1c', 'formshot', 'journal1c', 'merge1c', 'graph1c', 'borrow1c', 'meta-apply',
  'deslop', 'sync1c', 'freshness1c', 'index1c', 'process1c', 'ready1c', 'status1c',
  'document-import', 'settings1c', 'mcp1c',
];

test('new command names do not reuse the foreign roots', () => {
  for (const name of NEW_COMMANDS) {
    for (const root of ROOTS) {
      assert.equal(name.includes(root), false, `${name} contains ${root}`);
    }
  }
});

test('package does not register the foreign command names', () => {
  const extensions = path.join(profileRoot(), 'packages', 'pi-1c-agent', 'extensions');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  walk(extensions);
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const name of FOREIGN) {
    assert.doesNotMatch(text, new RegExp(`registerCommand\\("${name}"`));
  }
});
