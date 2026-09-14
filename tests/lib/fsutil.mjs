import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { profileRoot, walkFiles } from './profile-root.mjs';

const SKIP_COPY_TOP = new Set([
  '.git',
  'tests',
  'node_modules',
  'pi-1c-agent-upstream',
  'node',
  'npm',
  'bin',
]);
const SKIP_COPY_NAMES = new Set(['auth.json', 'trust.json', '.dev.env']);

function shouldCopy(srcRoot, srcPath) {
  const rel = path.relative(srcRoot, srcPath);
  if (!rel || rel.startsWith('..')) return true;
  const parts = rel.split(path.sep);
  if (SKIP_COPY_TOP.has(parts[0])) return false;
  if (SKIP_COPY_NAMES.has(path.basename(srcPath))) return false;
  return true;
}

export function snapshotTree(root) {
  const map = {};
  for (const filePath of walkFiles(root)) {
    const rel = path.relative(root, filePath).split(path.sep).join('/');
    const buf = fs.readFileSync(filePath);
    map[rel] = crypto.createHash('sha256').update(buf).digest('hex');
  }
  return map;
}

export function diffTree(before, after) {
  const created = [];
  const modified = [];
  const deleted = [];
  const beforeKeys = new Set(Object.keys(before ?? {}));
  const afterKeys = new Set(Object.keys(after ?? {}));
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) created.push(key);
    else if (before[key] !== after[key]) modified.push(key);
  }
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) deleted.push(key);
  }
  created.sort();
  modified.sort();
  deleted.sort();
  return { created, modified, deleted };
}

export async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-1c-profile-test-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function withTempProfileCopy(fn) {
  return withTempDir(async (dir) => {
    const src = profileRoot();
    const dest = path.join(dir, 'profile');
    fs.cpSync(src, dest, {
      recursive: true,
      filter: (srcPath) => shouldCopy(src, srcPath),
    });
    return fn(dest);
  });
}

export async function withTempWorkspace(fn) {
  return withTempDir(async (dir) => {
    const dest = path.join(dir, 'project');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'README.md'), 'temp project workspace\n');
    return fn(dest);
  });
}
