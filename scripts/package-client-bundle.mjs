#!/usr/bin/env node
/**
 * Write dist/pi-1c-agent-<version>-client.zip from the profile allowlist.
 * Does not change the git tree. See rules-1c/core/release-bundle.md.
 *
 *   node scripts/package-client-bundle.mjs [--out dist] [--version 0.9.1]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeClientBundle } from './lib/client-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
}

const result = writeClientBundle(root, {
  outDir: flag('--out') ? path.resolve(flag('--out')) : undefined,
  version: flag('--version') || undefined,
});
console.log(`${result.zipPath}`);
console.log(`${result.sumsPath}`);
console.log(`files: ${result.fileCount}`);
