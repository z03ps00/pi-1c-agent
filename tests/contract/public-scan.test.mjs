import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';
import {
  listPublishableFiles,
  scanPublicTree,
  scanPublishableContent,
} from '../lib/public-scan.mjs';

const DENY_PREFIXES = [
  'openspec/changes/',
  'handoffs/',
  '.cursor/plans/',
  '.cursor/commands/opsx-',
  '.cursor/skills/openspec-',
  '.pi/prompts/opsx-',
  '.pi/skills/openspec-',
];

function isDenied(rel) {
  const n = rel.replace(/\\/g, '/');
  if (n.startsWith('state/agent-memory/pending/') && !n.endsWith('.gitkeep')) return true;
  if (n.startsWith('state/agent-memory/done/') && !n.endsWith('.gitkeep')) return true;
  return DENY_PREFIXES.some((p) => n.startsWith(p));
}

test('publishable file list excludes development artifacts', () => {
  const files = listPublishableFiles(profileRoot());
  const leaked = files.filter(isDenied);
  assert.deepEqual(leaked, [], `dev artifacts still publishable:\n${leaked.join('\n')}`);
});

test('LICENSE and NOTICE ship with the MIT boundary', () => {
  const root = profileRoot();
  const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(license, /MIT License/);
  const notice = fs.readFileSync(path.join(root, 'NOTICE'), 'utf8');
  assert.match(notice, /comol\/ai_rules_1c/);
  assert.match(notice, /Desko77\/cursor-1c-skills/);
  assert.match(notice, /Humanizer_RU/);
  assert.match(notice, /Licensing boundary/i);
});

test('scanPublishableContent flags identity and real key shapes, ignores fixtures', () => {
  const who = 'pav' + 'el';
  const vol = '/mnt/vol_' + '328/work';
  assert.deepEqual(scanPublishableContent('README.md', 'hello community'), []);
  assert.ok(scanPublishableContent('x.md', `user ${who} was here`).includes('identity'));
  assert.ok(scanPublishableContent('x.md', `required: /home/${who}/.pi/x`).includes('identity'));
  assert.ok(scanPublishableContent('x.md', `see ${vol}`).some((h) => h.startsWith('path:')));
  assert.ok(scanPublishableContent('x.md', 'key ghp_' + 'a'.repeat(36)).includes('secret-shape'));
  assert.deepEqual(
    scanPublishableContent(
      'packages/pi-1c-agent/tests/memory-integrity.test.mjs',
      'sk-abcdefghijklmnopqrstuvwxyz012345',
    ),
    [],
  );
});

test('publication scan of this tree is clean', () => {
  const hits = scanPublicTree(profileRoot());
  assert.deepEqual(hits, [], `publication scan hits:\n${hits.join('\n')}`);
});
