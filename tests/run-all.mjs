#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitPorcelain, porcelainDelta } from './lib/git.mjs';
import { profileRoot } from './lib/profile-root.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));

function findTests(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'fixtures' || ent.name === 'lib' || ent.name === 'node_modules' || ent.name.startsWith('.')) {
        continue;
      }
      out.push(...findTests(p));
    } else if (ent.name.endsWith('.test.mjs')) {
      out.push(p);
    }
  }
  return out.sort();
}

const before = gitPorcelain(profileRoot());
const files = findTests(testsDir);
if (files.length === 0) {
  console.error('No *.test.mjs files found under tests/');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
const after = gitPorcelain(profileRoot());
const delta = porcelainDelta(before, after);
if (delta.added.length || delta.removed.length) {
  console.error('git status --porcelain changed for pre-existing tracked files after the suite:');
  for (const line of delta.added) console.error(`  + ${line}`);
  for (const line of delta.removed) console.error(`  - ${line}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
