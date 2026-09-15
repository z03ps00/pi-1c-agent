#!/usr/bin/env node
/**
 * Safe update of the Pi CLI shell (@earendil-works/pi-coding-agent)
 * in its npm prefix, without overwriting profile configs or secrets.
 * Usage: node scripts/update-pi-cli.mjs [status|check|force|overwrite] [<version>]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isProfileRoot, resolveProfileRoot } from './update-profile.mjs';

export const PI_CLI_PACKAGE = '@earendil-works/pi-coding-agent';
const MODE_STATUS = new Set(['status', 'check']);
const MODE_FORCE = new Set(['force', 'overwrite']);

export function parseArgs(argv = []) {
  let mode = 'update';
  let targetVersion = null;
  let customPrefix = null;

  for (const raw of argv) {
    const token = String(raw ?? '').trim();
    if (!token) continue;

    if (token.startsWith('--prefix=')) {
      customPrefix = token.slice('--prefix='.length).trim();
      continue;
    }

    const lower = token.replace(/^\/+/, '').toLowerCase();
    if (MODE_STATUS.has(lower)) {
      mode = 'status';
      continue;
    }
    if (MODE_FORCE.has(lower)) {
      mode = 'force';
      continue;
    }

    // Version or tag argument
    targetVersion = token.replace(/^\/+/, '');
  }

  return { mode, targetVersion, customPrefix };
}

export function compareSemver(a, b) {
  if (!a || !b) return 0;
  const clean = (s) =>
    String(s)
      .trim()
      .replace(/^v/, '')
      .split('-')[0]
      .split('.')
      .map((x) => parseInt(x, 10) || 0);

  const pa = clean(a);
  const pb = clean(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function whichCommand(whichBin, cmd, env = process.env) {
  try {
    const r = spawnSync(whichBin, [cmd], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status === 0 && r.stdout) {
      return r.stdout.trim().split(/\r?\n/)[0].trim();
    }
  } catch {}
  return null;
}

export function resolveExecutableChain(filePath, maxDepth = 6) {
  let cur = filePath;
  for (let i = 0; i < maxDepth; i++) {
    if (!cur || !fs.existsSync(cur)) break;
    try {
      const stat = fs.lstatSync(cur);
      if (stat.isSymbolicLink()) {
        const link = fs.readlinkSync(cur);
        cur = path.resolve(path.dirname(cur), link);
        continue;
      }
    } catch {}

    try {
      const text = fs.readFileSync(cur, 'utf8');
      const m = text.match(/PI_BIN=["']?([^"'\r\n]+)["']?/);
      if (m && m[1]) {
        cur = path.resolve(path.dirname(cur), m[1]);
        continue;
      }
    } catch {}

    break;
  }
  return cur;
}

export function findPrefixFromPackagePath(filePath) {
  if (!filePath) return null;
  const norm = filePath.replace(/\\/g, '/');
  const targetSub = `/node_modules/${PI_CLI_PACKAGE}`;
  const idx = norm.lastIndexOf(targetSub);
  if (idx !== -1) {
    let prefix = norm.slice(0, idx);
    if (path.basename(prefix) === 'lib') {
      prefix = path.dirname(prefix);
    }
    return prefix;
  }
  return null;
}

export function resolveNpmPrefix(opts = {}) {
  const env = opts.env ?? process.env;
  if (opts.customPrefix) {
    return path.resolve(opts.customPrefix);
  }
  if (env.PI_UPDATE_PREFIX) {
    return path.resolve(env.PI_UPDATE_PREFIX);
  }

  const piBin = opts.piBin || whichCommand(opts.whichBin || 'which', 'pi', env);
  if (!piBin) return null;

  const realBin = resolveExecutableChain(piBin);
  if (!realBin) return null;

  // Case 1: realBin is inside node_modules/@earendil-works/pi-coding-agent
  const fromPkg = findPrefixFromPackagePath(realBin);
  if (fromPkg && fs.existsSync(fromPkg)) {
    return fromPkg;
  }

  // Case 2: realBin is inside <prefix>/bin/pi
  const binDir = path.dirname(realBin);
  if (path.basename(binDir) === 'bin') {
    const parentDir = path.dirname(binDir);
    const libPkg = path.join(parentDir, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent');
    const directPkg = path.join(parentDir, 'node_modules', '@earendil-works', 'pi-coding-agent');
    if (fs.existsSync(libPkg) || fs.existsSync(directPkg)) {
      return parentDir;
    }
  }

  // Case 3: Try npm prefix -g if pi resides in it
  const npmBin = opts.npmBin || 'npm';
  try {
    const r = spawnSync(npmBin, ['prefix', '-g'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status === 0 && r.stdout) {
      const gPrefix = r.stdout.trim();
      if (gPrefix && fs.existsSync(gPrefix)) {
        const rel = path.relative(gPrefix, realBin);
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
          return gPrefix;
        }
      }
    }
  } catch {}

  return null;
}

export function getCurrentVersion(prefix) {
  if (!prefix) return null;
  const candidates = [
    path.join(prefix, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json'),
    path.join(prefix, 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const doc = JSON.parse(fs.readFileSync(c, 'utf8'));
        if (doc && doc.version) return String(doc.version).trim();
      } catch {}
    }
  }
  return null;
}

export function getCliVersion(piBin, env = process.env) {
  try {
    const r = spawnSync(piBin, ['--version'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status === 0 && r.stdout) {
      const v = r.stdout.trim().split(/\r?\n/)[0].trim();
      if (v) return v;
    }
  } catch {}
  return null;
}

export function getLatestNpmVersion(npmBin = 'npm', env = process.env) {
  try {
    const r = spawnSync(npmBin, ['view', PI_CLI_PACKAGE, 'version'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
    if (r.status === 0 && r.stdout) {
      const version = r.stdout.trim().split(/\r?\n/)[0].trim();
      if (version) return { ok: true, version };
    }
    const err = (r.stderr || r.stdout || '').trim();
    return { ok: false, err: err || `npm view exited ${r.status}` };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

function fileSha(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function snapshotProfileConfigs({ profileDir, prefixDir }) {
  const dirsToScan = new Set();
  if (profileDir && fs.existsSync(profileDir)) {
    dirsToScan.add(path.resolve(profileDir));
  }

  if (prefixDir && fs.existsSync(prefixDir)) {
    try {
      const entries = fs.readdirSync(prefixDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const name = ent.name;
          if (name !== 'bin' && name !== 'lib' && name !== 'node_modules' && !name.startsWith('.')) {
            dirsToScan.add(path.resolve(prefixDir, name));
          }
        }
      }
    } catch {}
  }

  const files = new Map();
  const targetNames = ['settings.json', 'mcp.json', 'auth.json', 'trust.json'];

  for (const dir of dirsToScan) {
    for (const name of targetNames) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const sha = fileSha(filePath);
          let parsed = null;
          try {
            parsed = JSON.parse(content);
          } catch {}
          files.set(filePath, {
            path: filePath,
            sha,
            content,
            parsed,
          });
        } catch {}
      }
    }
  }

  let prefixDirs = [];
  if (prefixDir && fs.existsSync(prefixDir)) {
    try {
      prefixDirs = fs.readdirSync(prefixDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {}
  }

  return { files, prefixDirs };
}

export function verifyAndRestoreConfigs(snapshot, { prefixDir }) {
  const restored = [];
  const intact = [];

  if (!snapshot || !snapshot.files) {
    return { restored, intact };
  }

  for (const [filePath, snap] of snapshot.files.entries()) {
    if (!fs.existsSync(filePath)) {
      // Restoring deleted file
      try {
        fs.writeFileSync(filePath, snap.content, 'utf8');
        restored.push(path.basename(filePath));
      } catch {}
      continue;
    }

    const currentSha = fileSha(filePath);
    if (currentSha === snap.sha) {
      intact.push(path.basename(filePath));
      continue;
    }

    // File was modified
    const fileName = path.basename(filePath);
    if (fileName === 'settings.json') {
      try {
        const currentDoc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const snapDoc = snap.parsed;
        let onlyChangelogChanged = false;
        if (snapDoc && typeof snapDoc === 'object' && currentDoc && typeof currentDoc === 'object') {
          const diffKeys = [];
          const allKeys = new Set([...Object.keys(snapDoc), ...Object.keys(currentDoc)]);
          for (const k of allKeys) {
            if (JSON.stringify(snapDoc[k]) !== JSON.stringify(currentDoc[k])) {
              diffKeys.push(k);
            }
          }
          if (diffKeys.length === 1 && diffKeys[0] === 'lastChangelogVersion') {
            onlyChangelogChanged = true;
          }
        }

        if (onlyChangelogChanged) {
          intact.push(fileName);
          continue;
        }

        // Restore snapshot, retaining lastChangelogVersion if new
        const restoredDoc = { ...snapDoc };
        if (currentDoc && currentDoc.lastChangelogVersion) {
          restoredDoc.lastChangelogVersion = currentDoc.lastChangelogVersion;
        }
        fs.writeFileSync(filePath, `${JSON.stringify(restoredDoc, null, 2)}\n`, 'utf8');
        restored.push(fileName);
      } catch {
        fs.writeFileSync(filePath, snap.content, 'utf8');
        restored.push(fileName);
      }
    } else {
      // mcp.json, auth.json, trust.json - restore exactly
      try {
        fs.writeFileSync(filePath, snap.content, 'utf8');
        restored.push(fileName);
      } catch {}
    }
  }

  return { restored, intact };
}

export function runNpmInstall({ prefixDir, targetVersion, npmBin = 'npm', env = process.env }) {
  const pkgSpec = targetVersion ? `${PI_CLI_PACKAGE}@${targetVersion}` : PI_CLI_PACKAGE;
  const args = ['install', '--prefix', prefixDir, '--ignore-scripts', pkgSpec];
  const r = spawnSync(npmBin, args, {
    cwd: prefixDir,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  });

  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim();
    return { ok: false, err: err || `npm install exited ${r.status}` };
  }

  return { ok: true };
}

export function hostCopyPaste(prefix) {
  const p = prefix || '$PI_PREFIX';
  return [
    `npm install --prefix "${p}" --ignore-scripts @earendil-works/pi-coding-agent@latest`,
    'npm install -g --ignore-scripts @earendil-works/pi-coding-agent@latest',
  ];
}

function resultBase(partial) {
  return {
    ok: false,
    exitCode: 1,
    action: 'error',
    state: 'error',
    lines: [],
    prefix: null,
    currentVersion: null,
    targetVersion: null,
    copyPaste: [],
    reminder: null,
    ...partial,
  };
}

function formatLines(result) {
  const lines = [];
  lines.push(`result: ${result.action}`);
  lines.push(`state: ${result.state}`);
  if (result.prefix) lines.push(`prefix: ${result.prefix}`);
  if (result.currentVersion) lines.push(`current_version: ${result.currentVersion}`);
  if (result.targetVersion) lines.push(`target_version: ${result.targetVersion}`);
  if (result.message) lines.push(result.message);
  if (result.reminder) lines.push(`reminder: ${result.reminder}`);
  if (!result.ok && result.copyPaste && result.copyPaste.length) {
    lines.push('copy_paste:');
    for (const cmd of result.copyPaste) lines.push(`  ${cmd}`);
  }
  return lines;
}

function finish(partial) {
  const result = resultBase(partial);
  if (!result.lines.length) result.lines = formatLines(result);
  return result;
}

function shippedRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function run(opts = {}) {
  const argv = opts.argv ?? [];
  const { mode, targetVersion: requestedTarget, customPrefix: argPrefix } = parseArgs(argv);
  const customPrefix = opts.customPrefix ?? argPrefix;
  const npmBin = opts.npmBin ?? 'npm';
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const loadedRoot = opts.loadedRoot ?? shippedRootFromScript();

  const profileDir = opts.profileDir ?? resolveProfileRoot({ env, cwd, loadedRoot });

  const prefixDir = resolveNpmPrefix({
    env,
    customPrefix,
    piBin: opts.piBin,
    whichBin: opts.whichBin,
    npmBin,
  });

  if (!prefixDir) {
    return finish({
      state: 'unknown-prefix',
      action: 'error',
      message: 'Could not detect Pi CLI npm installation prefix. Set PI_UPDATE_PREFIX=<path> or ensure "pi" is on PATH.',
      copyPaste: hostCopyPaste(),
    });
  }

  const currentVersion = opts.currentVersion ?? getCurrentVersion(prefixDir) ?? getCliVersion(opts.piBin || 'pi', env);
  if (!currentVersion) {
    return finish({
      state: 'not-installed',
      action: 'error',
      prefix: prefixDir,
      message: `Pi CLI package (${PI_CLI_PACKAGE}) is not found in prefix ${prefixDir}.`,
      copyPaste: hostCopyPaste(prefixDir),
    });
  }

  let targetVersion = requestedTarget;
  if (!targetVersion || targetVersion === 'latest') {
    if (opts.latestVersion) {
      targetVersion = opts.latestVersion;
    } else {
      const viewRes = getLatestNpmVersion(npmBin, env);
      if (!viewRes.ok) {
        if (mode === 'status') {
          return finish({
            ok: true,
            exitCode: 0,
            action: 'status',
            state: 'unknown',
            prefix: prefixDir,
            currentVersion,
            targetVersion: null,
            message: `Current Pi CLI version is ${currentVersion} in ${prefixDir}. Could not check latest version from npm: ${viewRes.err}`,
            copyPaste: [],
          });
        }
        return finish({
          state: 'fetch-failed',
          action: 'error',
          prefix: prefixDir,
          currentVersion,
          message: `Failed to fetch latest version from npm: ${viewRes.err}`,
          copyPaste: hostCopyPaste(prefixDir),
        });
      }
      targetVersion = viewRes.version;
    }
  }

  const cmp = compareSemver(currentVersion, targetVersion);
  let state = 'current';
  if (cmp < 0) state = 'behind';
  else if (cmp > 0) state = 'ahead';
  else state = 'current';

  if (mode === 'status') {
    return finish({
      ok: true,
      exitCode: 0,
      action: 'status',
      state,
      prefix: prefixDir,
      currentVersion,
      targetVersion,
      message: state === 'current'
        ? `Pi CLI is up to date (v${currentVersion}) in ${prefixDir}.`
        : (state === 'behind'
          ? `Pi CLI is behind (current: v${currentVersion}, target: v${targetVersion}) in ${prefixDir}.`
          : `Pi CLI is ahead (current: v${currentVersion}, target: v${targetVersion}) in ${prefixDir}.`),
      copyPaste: [],
    });
  }

  if (state === 'current' && mode !== 'force') {
    return finish({
      ok: true,
      exitCode: 0,
      action: 'noop',
      state: 'current',
      prefix: prefixDir,
      currentVersion,
      targetVersion,
      message: `Pi CLI is already current (v${currentVersion}) in ${prefixDir}. No files rewritten. Use force/overwrite to reinstall.`,
      copyPaste: [],
    });
  }

  if (state === 'ahead' && mode !== 'force') {
    return finish({
      ok: true,
      exitCode: 0,
      action: 'noop',
      state: 'ahead',
      prefix: prefixDir,
      currentVersion,
      targetVersion,
      message: `Installed Pi CLI (v${currentVersion}) is newer than target (v${targetVersion}). No files rewritten. Use force/overwrite to downgrade.`,
      copyPaste: [],
    });
  }

  const snapshot = snapshotProfileConfigs({ profileDir, prefixDir });

  let installResult;
  try {
    installResult = opts.installRunner
      ? opts.installRunner({ prefixDir, targetVersion, npmBin, env })
      : runNpmInstall({ prefixDir, targetVersion, npmBin, env });
  } catch (err) {
    installResult = { ok: false, err: err.message };
  }

  const restoreSummary = verifyAndRestoreConfigs(snapshot, { prefixDir });

  if (!installResult.ok) {
    return finish({
      state: 'install-failed',
      action: 'error',
      prefix: prefixDir,
      currentVersion,
      targetVersion,
      message: `npm install failed: ${installResult.err}`,
      copyPaste: hostCopyPaste(prefixDir),
    });
  }

  const newVersion = opts.newVersion ?? getCurrentVersion(prefixDir) ?? targetVersion;

  const restoredInfo = restoreSummary.restored.length
    ? ` Restored modified config files: ${restoreSummary.restored.join(', ')}.`
    : '';

  return finish({
    ok: true,
    exitCode: 0,
    action: 'updated',
    state: 'current',
    prefix: prefixDir,
    currentVersion,
    targetVersion: newVersion,
    message: `Pi CLI updated from v${currentVersion} to v${newVersion} in ${prefixDir}. Profile configurations and secrets preserved.${restoredInfo}`,
    reminder: 'Restart Pi to run the updated binary, then check with /doctor.',
    copyPaste: [],
  });
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(path.resolve(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const result = run({
    argv: process.argv.slice(2),
    loadedRoot: shippedRootFromScript(),
  });
  for (const line of result.lines) console.log(line);
  process.exit(result.exitCode);
}
