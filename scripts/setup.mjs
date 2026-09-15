#!/usr/bin/env node
/**
 * First-time Pi 1C profile setup: resolve the in-repo package path,
 * fill settings.json, and copy auth/trust examples when missing.
 * Usage: node scripts/setup.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SDK_REMINDER,
  applyPi1cAgentPackagePath,
  inRepoPackageDir,
  inRepoPackageReady,
  isLocalPi1cAgentPath,
  isProfileRoot,
  resolveProfileRoot,
} from './update-profile.mjs';

const AUTH_EXAMPLE = 'auth.example.json';
const TRUST_EXAMPLE = 'trust.example.json';

function shippedRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, doc) {
  fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`);
}

export function copyExampleIfMissing(profileRoot, destName, exampleName) {
  const dest = path.join(profileRoot, destName);
  if (fs.existsSync(dest)) {
    return { copied: false, existed: true, dest };
  }
  const example = path.join(profileRoot, exampleName);
  if (!fs.existsSync(example)) {
    return { copied: false, existed: false, missingExample: true, dest, example };
  }
  fs.copyFileSync(example, dest);
  return { copied: true, existed: false, dest };
}

function resultBase(partial) {
  return {
    ok: false,
    exitCode: 1,
    action: 'error',
    state: 'error',
    lines: [],
    profileRoot: null,
    packagePath: null,
    ...partial,
  };
}

function formatLines(result) {
  const lines = [];
  lines.push(`result: ${result.action}`);
  lines.push(`state: ${result.state}`);
  if (result.profileRoot) lines.push(`profile: ${result.profileRoot}`);
  if (result.packagePath) lines.push(`package: ${result.packagePath}`);
  if (result.authCopied) lines.push('auth.json: copied from auth.example.json');
  if (result.trustCopied) lines.push('trust.json: copied from trust.example.json');
  if (result.message) lines.push(result.message);
  if (result.ok && result.reminder) lines.push(`reminder: ${result.reminder}`);
  if (result.ok) lines.push('next: /doctor');
  return lines;
}

function finish(partial) {
  const result = resultBase(partial);
  if (!result.lines.length) result.lines = formatLines(result);
  return result;
}

export function run(opts = {}) {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const loadedRoot = opts.loadedRoot ?? shippedRootFromScript();
  const profileDir = resolveProfileRoot({ env, cwd, loadedRoot });

  if (!profileDir || !isProfileRoot(profileDir)) {
    return finish({
      state: 'not-profile',
      message:
        'Could not resolve the Pi 1C profile root. Set PI_CODING_AGENT_DIR to the clone, then retry.',
    });
  }

  if (!inRepoPackageReady(profileDir)) {
    return finish({
      profileRoot: profileDir,
      state: 'package-missing',
      message: `In-repo package missing at ${inRepoPackageDir(profileDir)}. Clone the full repository (packages/pi-1c-agent must be present).`,
    });
  }

  const packagePath = inRepoPackageDir(profileDir);
  const settingsPath = path.join(profileDir, 'settings.json');
  const beforeSettings = readJsonFile(settingsPath) ?? { packages: [] };
  const beforePkgs = Array.isArray(beforeSettings.packages) ? beforeSettings.packages : [];
  const existingLocal = beforePkgs.find((entry) => isLocalPi1cAgentPath(entry));
  const keepExisting = Boolean(existingLocal && path.resolve(existingLocal) !== packagePath);

  let afterSettings = beforeSettings;
  let action = 'noop';
  if (keepExisting) {
    action = 'kept-existing';
  } else if (existingLocal && path.resolve(existingLocal) === packagePath) {
    action = 'noop';
  } else {
    afterSettings = applyPi1cAgentPackagePath(beforeSettings, packagePath);
    writeJsonFile(settingsPath, afterSettings);
    action = 'configured';
  }

  const auth = copyExampleIfMissing(profileDir, 'auth.json', AUTH_EXAMPLE);
  const trust = copyExampleIfMissing(profileDir, 'trust.json', TRUST_EXAMPLE);

  const message =
    action === 'kept-existing'
      ? `settings.json already uses ${existingLocal}. In-repo package is at ${packagePath}.`
      : action === 'noop'
        ? `settings.json already points at the in-repo package. No files rewritten.`
        : `settings.json packages[0] now points at the in-repo package.`;

  return finish({
    ok: true,
    exitCode: 0,
    action,
    state: 'ready',
    profileRoot: profileDir,
    packagePath: keepExisting ? existingLocal : packagePath,
    authCopied: auth.copied,
    trustCopied: trust.copied,
    reminder: SDK_REMINDER,
    message,
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
  const result = run({ loadedRoot: shippedRootFromScript() });
  for (const line of result.lines) console.log(line);
  process.exit(result.exitCode);
}
