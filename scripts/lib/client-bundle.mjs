/**
 * Allowlist packager for the client profile zip.
 * The git tree stays the full profile. This module only copies what Pi needs to run.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { scanPublishableContent } from '../../tests/lib/public-scan.mjs';

const ROOT_FILES = [
  'AGENTS.md',
  'README.md',
  'INSTALL-AGENT.md',
  'LICENSE',
  'NOTICE',
  'LAB-EXTRAS.md',
  'lab-extras.lock.json',
  'UPSTREAM-REGISTER.md',
  'upstream.lock.json',
  'MCP-OAUTH.md',
  'package.json',
  'settings.json',
  '.gitignore',
  'mcp.example.json',
  'auth.example.json',
  'trust.example.json',
  'dev.env.lab-extras.example',
  'cursor-sdk.json',
  'cursor-sdk-context-windows.json',
  'models-store.json',
];

const ROOT_DIRS = ['agents', 'prompts', 'skills', 'rules-1c', 'mcp.optional', 'manifest'];

const SCRIPT_FILES = [
  'pi-1c',
  'pi-1c.cmd',
  'pi-1c-ctl',
  'pi-1c-ctl.cmd',
  'pi-1c-ctl.mjs',
  'pi-1c-acp',
  'pi-1c-acp.cmd',
  'Pi-1C-Agent.desktop.in',
  'setup.mjs',
  'update-profile.mjs',
  'update-pi-cli.mjs',
  'lib/pi-1c-ctl-lib.mjs',
];

const STATE_FILES = [
  'state/agent-memory/README.md',
  'state/agent-memory/task-completion-template.md',
  'state/agent-memory/pending/.gitkeep',
  'state/agent-memory/done/.gitkeep',
  'state/evolution/.gitkeep',
];

const FORBIDDEN_BASENAMES = new Set([
  'auth.json',
  'trust.json',
  '.dev.env',
  '.env',
  'config.env',
]);

const TEXT_RE = /\.(md|txt|json|ya?ml|ts|mjs|js|sh|example)$/i;
const TEXT_NAMES = new Set(['NOTICE', 'LICENSE', 'AGENTS.md']);

function dosDate(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export function zipEntries(entries, date = new Date()) {
  const stamp = dosDate(date);
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const data = entry.data;
    const compressed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data) >>> 0;
    const mode = (entry.mode ?? 0o100644) & 0xffff;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localBuf = Buffer.concat([local, name, compressed]);
    localParts.push(localBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, name]));
    offset += localBuf.length;
  }
  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuf, end]);
}

export function listZipNames(buf) {
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i -= 1;
  if (i < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(i + 8);
  let cursor = buf.readUInt32LE(i + 16);
  const names = [];
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error('bad central directory');
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extra = buf.readUInt16LE(cursor + 30);
    const comment = buf.readUInt16LE(cursor + 32);
    names.push(buf.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8'));
    cursor += 46 + nameLen + extra + comment;
  }
  return names;
}

function isText(rel) {
  return TEXT_RE.test(rel) || TEXT_NAMES.has(path.basename(rel));
}

function isGitIgnored(root, rel) {
  const result = spawnSync('git', ['check-ignore', '-q', '--', rel], {
    cwd: root,
    env: { ...process.env, GIT_DISCOVERY_ACROSS_FILESYSTEM: '1' },
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git check-ignore failed for ${rel}: ${result.stderr || result.stdout}`);
}

function isLiveSecret(rel) {
  const base = path.posix.basename(rel);
  if (base.endsWith('.example')) return false;
  return rel.split('/').includes('secrets');
}

function assertSafeName(rel) {
  const base = path.posix.basename(rel);
  if (FORBIDDEN_BASENAMES.has(base)) {
    throw new Error(`client bundle refused live credential file: ${rel}`);
  }
  const parts = rel.split('/');
  if (parts.includes('node_modules') || parts.includes('.git') || parts.includes('external-agent-sources')) {
    throw new Error(`client bundle refused path: ${rel}`);
  }
}

function readFileEntry(root, rel) {
  const abs = path.join(root, rel);
  const st = fs.lstatSync(abs);
  if (!st.isFile()) throw new Error(`client bundle expected a file: ${rel}`);
  assertSafeName(rel);
  const data = fs.readFileSync(abs);
  if (isText(rel)) {
    const hits = scanPublishableContent(rel, data.toString('utf8'));
    if (hits.length) throw new Error(`client bundle scan failed: ${rel}:${hits.join(',')}`);
  }
  const executable = (st.mode & 0o111) !== 0;
  return { name: rel, data, mode: executable ? 0o100755 : 0o100644 };
}

function walkDir(root, rel, skipDir) {
  const abs = path.join(root, rel);
  const out = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (ent.isSymbolicLink()) continue;
    const child = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (skipDir?.(child, ent.name)) continue;
      out.push(...walkDir(root, child, skipDir));
      continue;
    }
    if (!ent.isFile()) continue;
    if (FORBIDDEN_BASENAMES.has(ent.name) || isLiveSecret(child) || isGitIgnored(root, child)) continue;
    out.push(readFileEntry(root, child));
  }
  return out;
}

function mcpJsonEntry(root) {
  const live = path.join(root, 'mcp.json');
  const example = path.join(root, 'mcp.example.json');
  let payload = fs.readFileSync(example);
  if (fs.existsSync(live)) {
    const parsed = JSON.parse(fs.readFileSync(live, 'utf8'));
    const servers = parsed?.mcpServers;
    const empty = servers && typeof servers === 'object' && !Array.isArray(servers) && Object.keys(servers).length === 0;
    if (empty) payload = fs.readFileSync(live);
  }
  const rel = 'mcp.json';
  const hits = scanPublishableContent(rel, payload.toString('utf8'));
  if (hits.length) throw new Error(`client bundle scan failed: ${rel}:${hits.join(',')}`);
  return { name: rel, data: payload, mode: 0o100644 };
}

export function packageVersion(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'pi-1c-agent', 'package.json'), 'utf8'));
  if (!pkg.version || typeof pkg.version !== 'string') throw new Error('package version missing');
  return pkg.version;
}

export function collectClientEntries(root) {
  const entries = [];
  for (const rel of ROOT_FILES) entries.push(readFileEntry(root, rel));
  entries.push(mcpJsonEntry(root));
  for (const dir of ROOT_DIRS) {
    entries.push(...walkDir(root, dir));
  }
  entries.push(...walkDir(root, 'packages/pi-1c-agent', (_rel, name) => name === 'tests' || name === 'node_modules'));
  for (const rel of SCRIPT_FILES) entries.push(readFileEntry(root, `scripts/${rel}`));
  for (const rel of STATE_FILES) entries.push(readFileEntry(root, rel));
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const names = new Set();
  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`duplicate client bundle path: ${entry.name}`);
    names.add(entry.name);
  }
  return entries;
}

export function writeClientBundle(root, { outDir, version } = {}) {
  const resolvedVersion = version || packageVersion(root);
  const entries = collectClientEntries(root);
  const zipName = `pi-1c-agent-${resolvedVersion}-client.zip`;
  const sumsName = `SHA256SUMS-${resolvedVersion}.txt`;
  const zip = zipEntries(entries);
  const hash = crypto.createHash('sha256').update(zip).digest('hex');
  const destDir = outDir || path.join(root, 'dist');
  fs.mkdirSync(destDir, { recursive: true });
  const zipPath = path.join(destDir, zipName);
  const sumsPath = path.join(destDir, sumsName);
  fs.writeFileSync(zipPath, zip);
  fs.writeFileSync(sumsPath, `${hash}  ${zipName}\n`);
  return { zipPath, sumsPath, version: resolvedVersion, fileCount: entries.length, names: entries.map((e) => e.name) };
}
