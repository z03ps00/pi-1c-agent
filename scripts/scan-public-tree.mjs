#!/usr/bin/env node
/**
 * Publication gate: fail if a publishable file contains a real identity,
 * machine-local required path, or secret-shaped value.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPublicTree } from '../tests/lib/public-scan.mjs';

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const findings = scanPublicTree(root);
if (findings.length) {
  console.error('Public-tree scan failed:\n' + findings.map((h) => `  ${h}`).join('\n'));
  process.exit(1);
}
console.log(`Public-tree scan clean (${root})`);
