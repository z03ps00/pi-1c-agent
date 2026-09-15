#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const project = args.includes('--project');
const global = args.includes('--global');
const withOpenSpec = args.includes('--with-openspec');
if (project === global) {
  console.error('FAIL: choose exactly one scope: --project or --global');
  process.exit(2);
}

const run = (cmd, cmdArgs, opts = {}) => spawnSync(cmd, cmdArgs, { stdio: 'inherit', encoding: 'utf8', ...opts });
const existsCmd = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };

for (const cmd of ['node', 'git', 'pi']) if (!existsCmd(cmd)) fail(`required command not found: ${cmd}`);

console.log('STEP 1/3: register the Pi package (extensions/skills/prompts).');
const piArgs = ['install'];
if (project) piArgs.push('-l');
piArgs.push(root);
if (run('pi', piArgs, { cwd: process.cwd() }).status !== 0) fail('pi package registration failed');

console.log('STEP 2/3: bootstrap the pinned ai_rules_1c adaptation.');
const bootstrapArgs = [path.join(root, 'tools', 'bootstrap.mjs'), project ? '--project' : '--global'];
if (run(process.execPath, bootstrapArgs, { cwd: process.cwd() }).status !== 0) fail('1C rules bootstrap failed');

if (withOpenSpec) {
  console.log('OPTIONAL: initialize pinned/tested OpenSpec for vanilla Pi.');
  if (run(process.execPath, [path.join(root, 'tools', 'openspec-setup.mjs'), '--install-cli'], { cwd: process.cwd() }).status !== 0) {
    fail('OpenSpec setup failed');
  }
}

console.log('STEP 3/3: deterministic doctor gate.');
const doctorArgs = [path.join(root, 'tools', 'doctor.mjs'), project ? '--project' : '--global'];
if (withOpenSpec) doctorArgs.push('--require-openspec');
const doctor = run(process.execPath, doctorArgs, { cwd: process.cwd() });
process.exit(doctor.status ?? 1);
