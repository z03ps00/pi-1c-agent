import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { diffTree, snapshotTree, withTempProfileCopy, withTempWorkspace } from '../lib/fsutil.mjs';

test('withTempProfileCopy writes stay inside the temp copy', async () => {
  await withTempProfileCopy(async (profileDir) => {
    assert.ok(fs.existsSync(path.join(profileDir, 'AGENTS.md')));
    const marker = path.join(profileDir, 'tmp-marker.txt');
    fs.writeFileSync(marker, 'temp only\n');
    assert.equal(fs.readFileSync(marker, 'utf8'), 'temp only\n');
  });
});

test('withTempWorkspace + diffTree created/modified/deleted', async () => {
  await withTempWorkspace(async (projectDir) => {
    const before = snapshotTree(projectDir);
    fs.writeFileSync(path.join(projectDir, 'created.txt'), 'new\n');
    fs.writeFileSync(path.join(projectDir, 'README.md'), 'changed\n');
    const afterCreate = snapshotTree(projectDir);
    const createdDiff = diffTree(before, afterCreate);
    assert.deepEqual(createdDiff.created, ['created.txt']);
    assert.deepEqual(createdDiff.modified, ['README.md']);
    fs.rmSync(path.join(projectDir, 'created.txt'));
    const afterDelete = snapshotTree(projectDir);
    const deletedDiff = diffTree(afterCreate, afterDelete);
    assert.deepEqual(deletedDiff.deleted, ['created.txt']);
  });
});
