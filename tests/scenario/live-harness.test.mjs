import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { diffTree, snapshotTree, withTempProfileCopy, withTempWorkspace } from '../lib/fsutil.mjs';
import { liveSkipReason, tryLoadLiveSdk } from '../lib/live-agent.mjs';

const skip = liveSkipReason();

test('live scenario: PLAN-only file effects on temp profile + temp project', { skip }, async () => {
  const sdk = await tryLoadLiveSdk();
  if (!sdk) {
    throw new Error('RUN_LIVE_SCENARIOS=1 but pi-cursor-sdk could not be loaded');
  }
  await withTempProfileCopy(async (profileDir) => {
    await withTempWorkspace(async (projectDir) => {
      const beforeProject = snapshotTree(projectDir);
      const beforeProfile = snapshotTree(profileDir);
      await sdk.run({
        profileDir,
        projectDir,
        prompt: 'PLAN only: write a short plan. Do not modify project source.',
      });
      const projectDiff = diffTree(beforeProject, snapshotTree(projectDir));
      const profileDiff = diffTree(beforeProfile, snapshotTree(profileDir));
      const planningOk = (rel) =>
        rel.startsWith('openspec/') ||
        rel.startsWith('.pi/1c/plans/') ||
        rel.startsWith('.pi/1c/knowledge-drafts/');
      for (const rel of [...projectDiff.created, ...projectDiff.modified, ...projectDiff.deleted]) {
        assert.ok(planningOk(rel), `project file effect outside planning dirs: ${rel}`);
      }
      assert.ok(
        !profileDiff.modified.includes('mcp.json'),
        'live run must leave temp profile mcp.json untouched',
      );
      assert.ok(
        !profileDiff.modified.includes('settings.json'),
        'live run must leave temp profile settings.json untouched',
      );
    });
  });
});

test('live scenario self-skip reason is explicit when opted out', () => {
  if (process.env.RUN_LIVE_SCENARIOS === '1') return;
  assert.equal(skip, 'RUN_LIVE_SCENARIOS is not 1');
});
