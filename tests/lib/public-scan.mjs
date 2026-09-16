import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findMachineLocalPathHits } from './paths-scan.mjs';
import { profileRoot } from './profile-root.mjs';

/** Real-person / private-remote tokens that must not ship. Split so this file stays clean. */
const IDENTITY_RE = new RegExp(`\\b(${['pav' + 'el', 'alm' + 'az', 'z03' + 'ps00'].join('|')})\\b`, 'i');

const SECRET_SHAPE_RE = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk-|rk-|ghp_|gho_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
];

/** Known synthetic values used by redact / init tests — not leaks. */
const SYNTHETIC_SECRET_RE = [
  /sk-abcdefghijklmnopqrstuvwxyz012345/,
  /-----BEGIN PRIVATE KEY-----\nMIIB/,
];

/**
 * Files that intentionally contain secret-shaped fixtures or scanner bait.
 * Machine-path hits in these files are still reported unless the path is
 * a documented placeholder (`/home/<user>`, `/mnt/vol_*`).
 */
export const SECRET_FIXTURE_FILES = new Set([
  'packages/pi-1c-agent/lib/redact.mjs',
  'packages/pi-1c-agent/tests/memory-integrity.test.mjs',
  'packages/pi-1c-agent/tests/project-init.test.mjs',
  'tests/lib/public-scan.mjs',
  'tests/contract/public-scan.test.mjs',
]);

/**
 * Files where IDENTITY_RE hits are expected (e.g. GitHub clone URLs contain
 * the owner handle — that is intentional, not a leak).
 */
export const IDENTITY_FIXTURE_FILES = new Set([
  'README.md',
]);

/** Scanner / fixture files that must contain synthetic bad paths. */
export const PATH_FIXTURE_FILES = new Set([
  'tests/fixtures/paths/bad.md',
  'tests/unit/paths-scan.test.mjs',
  'packages/pi-1c-agent/lib/product-health.mjs',
  'packages/pi-1c-agent/tests/product-health.test.mjs',
]);

const TEXT_RE = /\.(md|txt|json|ya?ml|ts|mjs|js|sh|example)$/i;
const TEXT_NAMES = new Set(['NOTICE', 'LICENSE', 'AGENTS.md']);

export function listPublishableFiles(root = profileRoot()) {
  const files = new Set();
  const opts = { cwd: root, encoding: 'utf8' };
  for (const extra of [[], ['--others', '--exclude-standard']]) {
    const r = spawnSync('git', ['ls-files', '-z', ...extra], opts);
    if (r.status !== 0) {
      throw new Error(`git ls-files failed: ${r.stderr || r.stdout}`);
    }
    for (const rel of String(r.stdout || '').split('\0')) {
      if (rel) files.add(rel.replace(/\\/g, '/'));
    }
  }
  return [...files].sort();
}

function isTextFile(rel) {
  return TEXT_RE.test(rel) || TEXT_NAMES.has(path.basename(rel));
}

function stripSyntheticSecrets(text) {
  let out = String(text ?? '');
  for (const re of SYNTHETIC_SECRET_RE) out = out.replace(re, '[SYNTHETIC]');
  return out;
}

export function scanPublishableContent(rel, text) {
  const hits = [];
  const norm = rel.replace(/\\/g, '/');
  if (!IDENTITY_FIXTURE_FILES.has(norm) && IDENTITY_RE.test(text)) hits.push('identity');
  if (!PATH_FIXTURE_FILES.has(norm)) {
    const pathHits = findMachineLocalPathHits(text);
    for (const h of pathHits) hits.push(`path:${h}`);
  }
  if (!SECRET_FIXTURE_FILES.has(norm)) {
    const scanned = stripSyntheticSecrets(text);
    for (const re of SECRET_SHAPE_RE) {
      if (re.test(scanned)) {
        hits.push('secret-shape');
        break;
      }
    }
  }
  return hits;
}

export function scanPublicTree(root = profileRoot(), files = listPublishableFiles(root)) {
  const findings = [];
  for (const rel of files) {
    if (!isTextFile(rel)) continue;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const text = fs.readFileSync(abs, 'utf8');
    for (const hit of scanPublishableContent(rel, text)) {
      findings.push(`${rel}:${hit}`);
    }
  }
  return findings;
}
