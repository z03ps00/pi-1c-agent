import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { findMachineLocalPathHits, scanMachineLocalPaths } from '../lib/paths-scan.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'paths');

test('findMachineLocalPathHits: placeholders are clean', () => {
  const text = fs.readFileSync(path.join(fixtures, 'good.md'), 'utf8');
  assert.deepEqual(findMachineLocalPathHits(text), []);
});

test('findMachineLocalPathHits: doctor-style documentation of forbidden roots is clean', () => {
  const text = [
    'FAIL CORE if a shipped extra skill requires `/home/<user>/`, `/mnt/vol_*`, or `C:/Users/<someone>`',
    '`C:/Users/<someone>` or `C:\\Users\\<someone>` as a required path',
    '`D:\\1С_Базы` as a required path',
  ].join('\n');
  assert.deepEqual(findMachineLocalPathHits(text), []);
});

test('findMachineLocalPathHits: foreign home / volume / user path', () => {
  const text = fs.readFileSync(path.join(fixtures, 'bad.md'), 'utf8');
  const hits = findMachineLocalPathHits(text);
  assert.ok(hits.includes('absolute-linux-home'), hits);
  assert.ok(hits.includes('volume-mount'), hits);
  assert.ok(hits.includes('absolute-user-home'), hits);
});

test('scanMachineLocalPaths ignores the profile own root', () => {
  const root = profileRoot();
  const hits = findMachineLocalPathHits(`see ${root}/prompts/installmcp.md`, { ignoreRoots: [root] });
  assert.deepEqual(hits, []);
});

test('scanMachineLocalPaths skips .example files', async () => {
  const { withTempDir } = await import('../lib/fsutil.mjs');
  await withTempDir(async (dir) => {
    const example = path.join(dir, 'machine.example.md');
    fs.writeFileSync(example, '/home/<user>/secret/\n');
    const hits = scanMachineLocalPaths([example], { ignoreRoots: [] });
    assert.deepEqual(hits, []);
  });
});

test('scanMachineLocalPaths reports violating files', () => {
  const bad = path.join(fixtures, 'bad.md');
  const hits = scanMachineLocalPaths([bad], { ignoreRoots: [] });
  assert.ok(hits.some((h) => h.endsWith(':absolute-linux-home')), hits);
});
