import assert from 'node:assert/strict';
import test from 'node:test';
import { scanMachineLocalPaths } from '../lib/paths-scan.mjs';
import { listProfileShippedFiles, profileRoot } from '../lib/profile-root.mjs';

test('no shipped file contains a foreign machine-local path', () => {
  const root = profileRoot();
  const files = listProfileShippedFiles(root);
  const hits = scanMachineLocalPaths(files, { ignoreRoots: [root] });
  assert.deepEqual(hits, [], `foreign machine-local paths:\n${hits.join('\n')}`);
});
