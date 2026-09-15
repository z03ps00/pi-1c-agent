#!/usr/bin/env node
/**
 * Refresh the installed Pi 1C profile from its git remote.
 * Usage: node scripts/update-profile.mjs [status|check|force|overwrite] [<ref>]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PLACEHOLDER_PACKAGE = '<path-to-pi-1c-agent>';
export const DEFAULT_REMOTE = 'origin';
export const PRESERVED_TRACKED = new Set(['mcp.json', 'settings.json']);
export const SDK_REMINDER = 'pi install npm:pi-cursor-sdk';
export const PROFILE_MARKER = 'PI-1C-AGENT';

const MODE_STATUS = new Set(['status', 'check']);
const MODE_FORCE = new Set(['force', 'overwrite']);

export function redactRemoteUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/:\/\/[^/]*@/, '://');
}

export function parseArgs(argv = []) {
  let mode = 'update';
  let ref = null;
  for (const raw of argv) {
    const token = String(raw ?? '').trim();
    if (!token || token.startsWith('-')) continue;
    const lower = token.replace(/^\/+/, '').toLowerCase();
    if (MODE_STATUS.has(lower)) {
      mode = 'status';
      continue;
    }
    if (MODE_FORCE.has(lower)) {
      mode = 'force';
      continue;
    }
    ref = token.replace(/^\/+/, '');
  }
  return { mode, ref };
}

export function isProfileRoot(dir) {
  if (!dir) return false;
  try {
    const agentsPath = path.join(dir, 'AGENTS.md');
    const catalog = path.join(dir, 'prompts', 'CATALOG.md');
    const rules = path.join(dir, 'rules-1c');
    if (!fs.existsSync(agentsPath) || !fs.existsSync(catalog) || !fs.existsSync(rules)) {
      return false;
    }
    const agents = fs.readFileSync(agentsPath, 'utf8');
    return agents.includes(PROFILE_MARKER);
  } catch {
    return false;
  }
}

export function resolveProfileRoot(opts = {}) {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const loadedRoot = opts.loadedRoot;
  const fromEnv = env.PI_CODING_AGENT_DIR;
  if (fromEnv) return path.resolve(fromEnv);
  if (loadedRoot && isProfileRoot(loadedRoot)) return path.resolve(loadedRoot);
  if (isProfileRoot(cwd)) return path.resolve(cwd);
  return null;
}

export function restoreMcpServers(beforeDoc, incomingDoc) {
  const before = beforeDoc && typeof beforeDoc === 'object' ? beforeDoc : {};
  const incoming = incomingDoc && typeof incomingDoc === 'object' ? { ...incomingDoc } : {};
  const beforeServers =
    before.mcpServers && typeof before.mcpServers === 'object' ? before.mcpServers : {};
  const incomingServers =
    incoming.mcpServers && typeof incoming.mcpServers === 'object' ? { ...incoming.mcpServers } : {};
  for (const [name, spec] of Object.entries(beforeServers)) {
    if (!Object.prototype.hasOwnProperty.call(incomingServers, name)) {
      incomingServers[name] = spec;
    }
  }
  incoming.mcpServers = incomingServers;
  return incoming;
}

export const IN_REPO_PACKAGE_REL = path.join('packages', 'pi-1c-agent');

export function inRepoPackageDir(profileRoot) {
  if (!profileRoot) return null;
  return path.resolve(profileRoot, IN_REPO_PACKAGE_REL);
}

export function inRepoPackageReady(profileRoot) {
  const dir = inRepoPackageDir(profileRoot);
  return Boolean(dir && fs.existsSync(path.join(dir, 'package.json')));
}

export function applyPi1cAgentPackagePath(settings, packagePath) {
  const after = settings && typeof settings === 'object' ? { ...settings } : {};
  const afterPkgs = Array.isArray(after.packages) ? [...after.packages] : [];
  const idx = afterPkgs.findIndex(
    (entry) => entry === PLACEHOLDER_PACKAGE || isLocalPi1cAgentPath(entry),
  );
  if (idx >= 0) afterPkgs[idx] = packagePath;
  else afterPkgs.unshift(packagePath);
  after.packages = afterPkgs;
  return after;
}

export function restorePi1cAgentPath(beforeSettings, afterSettings, profileRoot) {
  const before = beforeSettings && typeof beforeSettings === 'object' ? beforeSettings : {};
  const after = afterSettings && typeof afterSettings === 'object' ? { ...afterSettings } : {};
  const beforePkgs = Array.isArray(before.packages) ? before.packages : [];
  const localPath = beforePkgs.find((entry) => isLocalPi1cAgentPath(entry));
  if (localPath) return applyPi1cAgentPackagePath(after, localPath);
  if (profileRoot && inRepoPackageReady(profileRoot)) {
    return applyPi1cAgentPackagePath(after, inRepoPackageDir(profileRoot));
  }
  return after;
}

export function isLocalPi1cAgentPath(entry) {
  if (typeof entry !== 'string' || !entry) return false;
  if (entry === PLACEHOLDER_PACKAGE) return false;
  if (/^npm:/i.test(entry) || /^https?:/i.test(entry)) return false;
  if (!/[\\/]/.test(entry) && !path.isAbsolute(entry)) return false;
  return /pi-1c-agent/i.test(entry);
}

export function blockingDirtyPaths(trackedPaths = []) {
  return trackedPaths.filter((rel) => {
    const normalized = String(rel).replace(/\\/g, '/');
    return !PRESERVED_TRACKED.has(normalized);
  });
}

export function parsePorcelain(text) {
  const tracked = [];
  const untracked = [];
  for (const line of String(text || '').split(/\r?\n/).filter(Boolean)) {
    if (/^\?\? /.test(line)) {
      untracked.push(line.slice(3));
      continue;
    }
    const renamed = line.match(/^(..) (?:.* -> )(.+)$/);
    if (renamed) {
      tracked.push(renamed[2]);
      continue;
    }
    const ordinary = line.match(/^(..) (.+)$/);
    if (ordinary) tracked.push(ordinary[2]);
  }
  return { tracked, untracked };
}

export function hostCopyPaste() {
  return [
    'git -C "$PI_CODING_AGENT_DIR" fetch origin',
    'git -C "$PI_CODING_AGENT_DIR" status -sb',
    'git -C "$PI_CODING_AGENT_DIR" merge --ff-only',
    'git -C "%PI_CODING_AGENT_DIR%" fetch origin',
    'git -C "%PI_CODING_AGENT_DIR%" merge --ff-only',
  ];
}

function shippedRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function gitOnPath(gitBin) {
  const r = spawnSync(gitBin, ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

function git(gitBin, cwd, args, extraEnv = {}) {
  return spawnSync(gitBin, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...extraEnv,
    },
  });
}

function gitOk(gitBin, cwd, args, extraEnv) {
  const r = git(gitBin, cwd, args, extraEnv);
  if (r.status !== 0) {
    const err = redactRemoteUrl((r.stderr || r.stdout || '').trim());
    const error = new Error(err || `git ${args.join(' ')} failed`);
    error.git = r;
    throw error;
  }
  return String(r.stdout || '').trimEnd();
}

function gitOut(gitBin, cwd, args, extraEnv) {
  const r = git(gitBin, cwd, args, extraEnv);
  return {
    ok: r.status === 0,
    text: String(r.stdout || '').trim(),
    err: redactRemoteUrl((r.stderr || r.stdout || '').trim()),
  };
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, doc) {
  fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`);
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

function resolveDefaultRef(gitBin, cwd, remote, explicit) {
  if (explicit) {
    if (explicit.includes('/') || explicit.includes('\\')) return explicit;
    const remoteRef = `${remote}/${explicit}`;
    const hasRemote = gitOut(gitBin, cwd, ['rev-parse', '--verify', '--quiet', remoteRef]);
    if (hasRemote.ok) return remoteRef;
    return explicit;
  }
  const upstream = gitOut(gitBin, cwd, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  if (upstream.ok && upstream.text) return upstream.text;
  const head = gitOut(gitBin, cwd, ['symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`]);
  if (head.ok && head.text) {
    return head.text.replace(/^refs\/remotes\//, '');
  }
  return `${remote}/main`;
}

function classifyRelation(gitBin, cwd, headSha, remoteSha, ref) {
  if (!headSha || !remoteSha) return 'unknown';
  if (headSha === remoteSha) return 'current';
  const headIsAncestor = gitOut(gitBin, cwd, ['merge-base', '--is-ancestor', headSha, ref]);
  if (headIsAncestor.ok) return 'behind';
  const remoteIsAncestor = gitOut(gitBin, cwd, ['merge-base', '--is-ancestor', remoteSha, 'HEAD']);
  if (remoteIsAncestor.ok) return 'ahead';
  return 'diverged';
}

function resultBase(partial) {
  return {
    ok: false,
    exitCode: 1,
    action: 'error',
    state: 'error',
    lines: [],
    copyPaste: hostCopyPaste(),
    reminder: null,
    oldSha: null,
    newSha: null,
    remoteUrlRedacted: '',
    dirtyPaths: [],
    profileRoot: null,
    ...partial,
  };
}

function finish(partial) {
  const result = resultBase(partial);
  if (!result.lines.length) {
    result.lines = formatLines(result);
  }
  return result;
}

function formatLines(result) {
  const lines = [];
  lines.push(`result: ${result.action}`);
  lines.push(`state: ${result.state}`);
  if (result.profileRoot) lines.push(`profile: ${result.profileRoot}`);
  if (result.remoteUrlRedacted) lines.push(`remote_url: ${result.remoteUrlRedacted}`);
  if (result.ref) lines.push(`ref: ${result.ref}`);
  if (result.oldSha) lines.push(`old_sha: ${result.oldSha}`);
  if (result.newSha) lines.push(`new_sha: ${result.newSha}`);
  if (result.dirtyPaths.length) lines.push(`dirty: ${result.dirtyPaths.join(', ')}`);
  if (result.message) lines.push(result.message);
  if (result.reminder) lines.push(`reminder: ${result.reminder}`);
  if (!result.ok && result.copyPaste.length) {
    lines.push('copy_paste:');
    for (const cmd of result.copyPaste) lines.push(`  ${cmd}`);
  }
  return lines;
}

export function run(opts = {}) {
  const argv = opts.argv ?? [];
  const { mode, ref: explicitRef } = parseArgs(argv);
  const gitBin = opts.gitBin ?? 'git';
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const loadedRoot = opts.loadedRoot ?? shippedRootFromScript();
  const remote = DEFAULT_REMOTE;

  const profileDir = resolveProfileRoot({ env, cwd, loadedRoot });
  if (!profileDir) {
    return finish({
      state: 'not-profile',
      message: 'Could not resolve the Pi 1C profile root. Set PI_CODING_AGENT_DIR to the clone.',
    });
  }
  if (!isProfileRoot(profileDir)) {
    return finish({
      profileRoot: profileDir,
      state: 'not-profile',
      message:
        'Target is not a Pi 1C profile (need AGENTS.md with PI-1C-AGENT, prompts/CATALOG.md, rules-1c/). This command never updates a 1C project. Clone the remote into $PI_CODING_AGENT_DIR per README.',
    });
  }

  if (!gitOnPath(gitBin)) {
    return finish({
      profileRoot: profileDir,
      state: 'no-git',
      message: 'git is not on PATH. Install git, then retry. No files were changed.',
    });
  }

  if (!fs.existsSync(path.join(profileDir, '.git'))) {
    return finish({
      profileRoot: profileDir,
      state: 'not-clone',
      message:
        'Profile root is not a git clone. Clone the remote into $PI_CODING_AGENT_DIR per README. This command does not create a new clone.',
    });
  }

  const remoteUrl = gitOut(gitBin, profileDir, ['remote', 'get-url', remote]);
  if (!remoteUrl.ok) {
    return finish({
      profileRoot: profileDir,
      state: 'no-remote',
      message: `No usable git remote "${remote}". Add origin, then retry. This command does not invent a URL or clone into a new directory.`,
    });
  }
  const remoteUrlRedacted = redactRemoteUrl(remoteUrl.text);

  let fetchWarning = null;
  try {
    gitOk(gitBin, profileDir, ['fetch', '--tags', remote]);
  } catch (err) {
    if (mode !== 'status') {
      return finish({
        profileRoot: profileDir,
        remoteUrlRedacted,
        state: 'fetch-failed',
        message: `git fetch failed: ${err.message}`,
      });
    }
    fetchWarning = `git fetch failed (status uses last known remote-tracking refs): ${err.message}`;
  }

  const ref = resolveDefaultRef(gitBin, profileDir, remote, explicitRef);
  const headSha = gitOut(gitBin, profileDir, ['rev-parse', 'HEAD']).text;
  const remoteRev = gitOut(gitBin, profileDir, ['rev-parse', '--verify', '--quiet', ref]);
  if (!remoteRev.ok) {
    return finish({
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      state: 'missing-ref',
      message: `Ref ${ref} is not available after fetch.`,
    });
  }
  const remoteSha = remoteRev.text;
  const relation = classifyRelation(gitBin, profileDir, headSha, remoteSha, ref);

  const porcelain = gitOk(gitBin, profileDir, ['status', '--porcelain=v1']);
  const { tracked } = parsePorcelain(porcelain);
  const dirtyPaths = blockingDirtyPaths(tracked);

  if (mode === 'status') {
    const state = dirtyPaths.length ? 'dirty' : relation;
    return finish({
      ok: true,
      exitCode: 0,
      action: 'status',
      state,
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      newSha: remoteSha,
      dirtyPaths,
      copyPaste: [],
      message: fetchWarning
        ? `Profile is ${state}. Working tree files were not changed. ${fetchWarning}`
        : `Profile is ${state}. Working tree files were not changed.`,
    });
  }

  if (dirtyPaths.length && mode !== 'force') {
    return finish({
      exitCode: 2,
      action: 'refused',
      state: 'dirty',
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      newSha: remoteSha,
      dirtyPaths,
      message: 'Tracked local edits would be overwritten. Re-run with force/overwrite only if you want that.',
    });
  }

  if (relation === 'current' && mode !== 'force') {
    return finish({
      ok: true,
      exitCode: 0,
      action: 'noop',
      state: 'current',
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      newSha: remoteSha,
      dirtyPaths,
      copyPaste: [],
      message: 'Profile is already current. No files rewritten.',
    });
  }

  if (relation === 'ahead' && mode !== 'force') {
    return finish({
      ok: true,
      exitCode: 0,
      action: 'noop',
      state: 'ahead',
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      newSha: remoteSha,
      dirtyPaths,
      copyPaste: [],
      message: 'Local branch is ahead of the remote ref. No files rewritten. Use force only to discard local commits.',
    });
  }

  if (relation === 'diverged' && mode !== 'force') {
    return finish({
      exitCode: 2,
      action: 'refused',
      state: 'diverged',
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      newSha: remoteSha,
      dirtyPaths,
      message: 'Update is not a fast-forward. Re-run with force/overwrite only if you want to reset to the remote ref.',
    });
  }

  const mcpPath = path.join(profileDir, 'mcp.json');
  const settingsPath = path.join(profileDir, 'settings.json');
  const beforeMcp = readJsonFile(mcpPath);
  const beforeSettings = readJsonFile(settingsPath);
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-1c-update-profile-'));
  try {
    copyIfExists(mcpPath, path.join(backupDir, 'mcp.json'));
    copyIfExists(settingsPath, path.join(backupDir, 'settings.json'));
    if (tracked.includes('mcp.json') || tracked.includes('settings.json')) {
      const restore = [];
      if (tracked.includes('mcp.json')) restore.push('mcp.json');
      if (tracked.includes('settings.json')) restore.push('settings.json');
      if (restore.length) gitOk(gitBin, profileDir, ['checkout', '--', ...restore]);
    }

    if (mode === 'force') {
      gitOk(gitBin, profileDir, ['reset', '--hard', ref]);
    } else {
      gitOk(gitBin, profileDir, ['merge', '--ff-only', ref]);
    }

    const incomingMcp = readJsonFile(mcpPath) ?? { mcpServers: {} };
    const incomingSettings = readJsonFile(settingsPath) ?? {};
    if (beforeMcp) writeJsonFile(mcpPath, restoreMcpServers(beforeMcp, incomingMcp));
    if (beforeSettings) {
      writeJsonFile(settingsPath, restorePi1cAgentPath(beforeSettings, incomingSettings, profileDir));
    }

    const newSha = gitOut(gitBin, profileDir, ['rev-parse', 'HEAD']).text;
    return finish({
      ok: true,
      exitCode: 0,
      action: 'updated',
      state: 'current',
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      newSha,
      dirtyPaths,
      copyPaste: [],
      reminder: SDK_REMINDER,
      message: 'Profile git files updated. npm packages were not changed.',
    });
  } catch (err) {
    const bakMcp = path.join(backupDir, 'mcp.json');
    const bakSettings = path.join(backupDir, 'settings.json');
    if (fs.existsSync(bakMcp)) fs.copyFileSync(bakMcp, mcpPath);
    if (fs.existsSync(bakSettings)) fs.copyFileSync(bakSettings, settingsPath);
    return finish({
      profileRoot: profileDir,
      remoteUrlRedacted,
      ref,
      oldSha: headSha,
      newSha: remoteSha,
      dirtyPaths,
      message: `Update failed: ${redactRemoteUrl(err.message)}`,
    });
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
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
