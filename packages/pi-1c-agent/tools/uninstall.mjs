#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const project = args.includes('--project');
const global = args.includes('--global');
if (project === global) {
  console.error('FAIL: choose exactly one scope: --project or --global');
  process.exit(2);
}
const scopeRoot = project ? path.resolve(process.cwd(), '.pi') : (process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), '.pi', 'agent'));
const stateDir = path.join(scopeRoot, '1c');
const manifestFile = path.join(stateDir, 'bootstrap.manifest.json');
if (!fs.existsSync(manifestFile)) {
  console.log('Nothing to uninstall: no bootstrap manifest.');
  process.exit(0);
}
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
for (const file of manifest.managedFiles ?? []) {
  try { if (fs.existsSync(file) && fs.statSync(file).isFile()) fs.rmSync(file, { force: true }); } catch {}
}
const contextFile = manifest.contextFile;
if (contextFile && fs.existsSync(contextFile)) {
  const start = '<!-- PI-1C-AGENT:BEGIN -->';
  const end = '<!-- PI-1C-AGENT:END -->';
  const re = new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, 'm');
  const current = fs.readFileSync(contextFile, 'utf8');
  fs.writeFileSync(contextFile, current.replace(re, '\n').trim() + '\n');
}
fs.rmSync(path.join(scopeRoot, 'pi-1c-agent-upstream'), { recursive: true, force: true });
fs.rmSync(manifestFile, { force: true });
console.log('PASS: removed files managed by Pi 1C bootstrap. Package registration itself is removed with `pi remove <source>`.');
