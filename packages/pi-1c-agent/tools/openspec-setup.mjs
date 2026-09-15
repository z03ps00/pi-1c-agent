#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const installCli = process.argv.includes('--install-cli');
const TESTED_VERSION = '1.12.0';
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8', cwd, ...opts });
const version = (cmd) => {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd });
  return r.status === 0 ? r.stdout.trim() : null;
};
const fail = (m, code = 1) => { console.error(`FAIL: ${m}`); process.exit(code); };

function nodeOk() {
  const m = process.versions.node.match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]), minor = Number(m[2]);
  return major > 20 || (major === 20 && minor >= 19);
}
if (!nodeOk()) fail(`OpenSpec requires Node.js >=20.19; found ${process.versions.node}`);

let current = version('openspec');
if (!current) {
  if (!installCli) {
    console.error(`USER_ACTION_REQUIRED: OpenSpec CLI is not installed. Re-run with --install-cli to install tested ${TESTED_VERSION}.`);
    process.exit(2);
  }
  if (!version('npm')) fail('npm is required to install OpenSpec CLI');
  const r = run('npm', ['install', '-g', `@fission-ai/openspec@${TESTED_VERSION}`]);
  if (r.status !== 0) fail(`npm global installation of @fission-ai/openspec@${TESTED_VERSION} failed`);
  current = version('openspec');
}
if (!current) fail('openspec is unavailable after installation');
if (!current.includes(TESTED_VERSION)) {
  console.warn(`WARN: tested OpenSpec version is ${TESTED_VERSION}; found ${current}. Continuing, but doctor should report this as a compatibility warning.`);
}

console.log('Initializing OpenSpec for vanilla Pi in:', cwd);
const init = run('openspec', ['init', '--tools', 'pi', '--no-animation']);
if (init.status !== 0) fail('openspec init --tools pi failed');

const openspecDir = path.join(cwd, 'openspec');
const piSkills = path.join(cwd, '.pi', 'skills');
const piPrompts = path.join(cwd, '.pi', 'prompts');
const hasOpenSpecSkill = fs.existsSync(piSkills) && fs.readdirSync(piSkills, { withFileTypes: true }).some((e) => e.isDirectory() && e.name.startsWith('openspec-'));
const hasOpsxPrompt = fs.existsSync(piPrompts) && fs.readdirSync(piPrompts).some((n) => /^opsx-.*\.md$/.test(n));
if (!fs.existsSync(openspecDir) || !hasOpenSpecSkill || !hasOpsxPrompt) {
  fail('OpenSpec CLI completed but expected vanilla Pi artifacts were not found under openspec/, .pi/skills/openspec-* and .pi/prompts/opsx-*.md');
}
console.log(`PASS: OpenSpec initialized for vanilla Pi (tested baseline ${TESTED_VERSION}).`);
