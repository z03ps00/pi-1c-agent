#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, suffix, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, suffix, out);
    else if (entry.name.endsWith(suffix)) out.push(full);
  }
  return out;
}

const mjs = [
  ...walk(path.join(root, 'lib'), '.mjs'),
  ...walk(path.join(root, 'tools'), '.mjs'),
  ...walk(path.join(root, 'tests'), '.mjs'),
];
const ts = walk(path.join(root, 'extensions'), '.ts');

let failed = 0;
for (const file of mjs) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    process.stderr.write(`${file}\n${r.stderr || r.stdout}`);
  }
}
for (const file of ts) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    process.stderr.write(`${file}\n${r.stderr || r.stdout}`);
  }
}

if (failed) {
  process.stderr.write(`typecheck failed: ${failed} file(s)\n`);
  process.exit(1);
}
process.stdout.write(`typecheck ok: ${mjs.length} js, ${ts.length} ts\n`);
