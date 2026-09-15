#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const project = args.includes('--project');
const global = args.includes('--global');
if (project === global) {
  console.error('FAIL: choose exactly one scope: --project or --global');
  process.exit(2);
}
const sourceIdx = args.indexOf('--source');
const explicitSource = sourceIdx >= 0 ? path.resolve(args[sourceIdx + 1] ?? '') : null;
const allowUnpinnedSource = args.includes('--allow-unpinned-source');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'upstream', 'UPSTREAM.lock.json'), 'utf8'));

const globalAgentDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), '.pi', 'agent');
const scopeRoot = project ? path.resolve(process.cwd(), '.pi') : globalAgentDir;
const projectRoot = project ? process.cwd() : null;
const contextFile = project ? path.join(projectRoot, 'AGENTS.md') : path.join(scopeRoot, 'AGENTS.md');
const stateDir = path.join(scopeRoot, '1c');
const manifestFile = path.join(stateDir, 'bootstrap.manifest.json');
const upstreamStore = path.join(scopeRoot, 'pi-1c-agent-upstream');
const rulesDir = path.join(scopeRoot, 'rules-1c');
const agentsDir = path.join(scopeRoot, 'agents');
const skillsDir = path.join(scopeRoot, 'skills');
const promptsDir = path.join(scopeRoot, 'prompts');

const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.cpSync(src, dst, { recursive: true, force: true }); };
const run = (cmd, cmdArgs, opts = {}) => spawnSync(cmd, cmdArgs, { stdio: 'inherit', encoding: 'utf8', ...opts });
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(agentsDir, { recursive: true });
fs.mkdirSync(skillsDir, { recursive: true });
fs.mkdirSync(promptsDir, { recursive: true });

function gitHead(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : null;
}

function fetchPinnedUpstream() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-1c-upstream-'));
  const dest = path.join(tmp, 'ai_rules_1c');
  fs.mkdirSync(dest, { recursive: true });
  for (const cmd of [
    ['git', ['init', '-q', dest]],
    ['git', ['-C', dest, 'remote', 'add', 'origin', lock.url]],
    ['git', ['-C', dest, 'fetch', '--depth', '1', 'origin', lock.commit]],
    ['git', ['-C', dest, 'checkout', '--detach', 'FETCH_HEAD']],
  ]) {
    const r = run(cmd[0], cmd[1]);
    if (r.status !== 0) fail(`cannot fetch pinned upstream ${lock.commit}`);
  }
  return dest;
}

let upstream = explicitSource;
if (upstream) {
  if (!fs.existsSync(path.join(upstream, 'content'))) fail(`--source does not look like ai_rules_1c: ${upstream}`);
  const head = gitHead(upstream);
  if (!allowUnpinnedSource && head !== lock.commit) fail(`source HEAD ${head ?? 'unknown'} does not match pinned commit ${lock.commit}`);
} else {
  const vendored = path.join(root, 'vendor', 'ai_rules_1c');
  const marker = path.join(vendored, '.pi-1c-source.json');
  if (fs.existsSync(path.join(vendored, 'content')) && fs.existsSync(marker)) {
    const meta = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (meta.commit !== lock.commit) fail(`vendored upstream commit ${meta.commit} != lock ${lock.commit}`);
    upstream = vendored;
  } else {
    upstream = fetchPinnedUpstream();
  }
}

const previousManifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;
for (const file of previousManifest?.managedFiles ?? []) {
  const abs = path.resolve(file);
  const safeRoots = [rulesDir, agentsDir, skillsDir, promptsDir].map((x) => path.resolve(x));
  if (safeRoots.some((r) => abs === r || abs.startsWith(`${r}${path.sep}`))) {
    try { if (fs.existsSync(abs) && fs.statSync(abs).isFile()) fs.rmSync(abs, { force: true }); } catch {}
  }
}

fs.rmSync(upstreamStore, { recursive: true, force: true });
cp(upstream, upstreamStore);

const globalPrefix = `${scopeRoot.replace(/\\/g, '/').replace(/\/$/, '')}/`;
const piRulesBase = project ? '.pi/rules-1c/' : `${globalPrefix}rules-1c/`;
const piSkillsBase = project ? '.pi/skills/' : `${globalPrefix}skills/`;
const piAgentsBase = project ? '.pi/agents/1c-' : `${globalPrefix}agents/1c-`;
const piPromptsBase = project ? '.pi/prompts/' : `${globalPrefix}prompts/`;
const piOpenSpecBundleBase = project ? '.pi/rules-1c/openspec-bundle-reference/' : `${globalPrefix}rules-1c/openspec-bundle-reference/`;

function rewritePaths(raw) {
  const pairs = [
    ['content/rules/', `${piRulesBase}rules/`],
    ['content/standards/', `${piRulesBase}standards/`],
    ['content/skills/', piSkillsBase],
    ['content/agents/', piAgentsBase],
    ['content/commands/', piPromptsBase],
    ['content/openspec-bundle/', piOpenSpecBundleBase],
  ];
  for (const [from, to] of pairs) raw = raw.split(from).join(to);
  return raw;
}

function dropFrontmatterKeys(raw, keys) {
  if (!raw.startsWith('---\n')) return raw;
  const end = raw.indexOf('\n---\n', 4);
  if (end < 0) return raw;
  let fm = raw.slice(4, end).split('\n');
  fm = fm.filter((line) => !keys.some((k) => new RegExp(`^${k}:\\s*`).test(line)));
  return `---\n${fm.join('\n')}\n---\n${raw.slice(end + 5)}`;
}

function adaptRule(raw) { return rewritePaths(dropFrontmatterKeys(raw, ['globs', 'category'])); }
function adaptStandard(raw) { return rewritePaths(raw); }
function adaptSkill(raw) { return rewritePaths(raw); }
function adaptCommand(raw) { return rewritePaths(dropFrontmatterKeys(raw, ['argumentHint', 'allowedTools'])); }
function adaptAgent(raw) {
  raw = raw.replace(/^isSubagent:.*\n/gm, '').replace(/^allowParallel:.*\n/gm, '');
  let hasMcp = false;
  raw = raw.replace(/^tools:\s*\[(.*?)\]\s*$/gm, (_, inside) => {
    const map = { Read: 'read', Write: 'write', Edit: 'edit', Grep: 'grep', Glob: 'find', Shell: 'bash', Bash: 'bash' };
    const source = inside.split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    hasMcp = source.some((x) => x.toUpperCase() === 'MCP');
    const tools = source.filter((x) => x.toUpperCase() !== 'MCP').map((x) => map[x] ?? x.toLowerCase());
    return `tools: ${[...new Set(tools)].join(', ')}`;
  });
  if (hasMcp && !/^capabilities:/m.test(raw)) {
    const end = raw.indexOf('\n---\n', 4);
    if (raw.startsWith('---\n') && end >= 0) raw = `${raw.slice(0, end)}\ncapabilities: mcp${raw.slice(end)}`;
  }
  return rewritePaths(raw);
}

const managedFiles = [];
const mapping = [];
function writeAdapted(src, dst, adapter, kind) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const sourceRaw = fs.readFileSync(src);
  const out = /\.(md|txt|json|ya?ml)$/i.test(src) ? Buffer.from(adapter(sourceRaw.toString('utf8'))) : sourceRaw;
  fs.writeFileSync(dst, out);
  managedFiles.push(dst);
  mapping.push({ source: path.relative(upstream, src), target: path.relative(scopeRoot, dst), kind, sourceSha256: sha256(sourceRaw), adaptedSha256: sha256(out) });
}

function walkAdapted(src, dst, adapter, kind) {
  if (!fs.existsSync(src)) return;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) walkAdapted(s, d, adapter, kind);
    else writeAdapted(s, d, adapter, kind);
  }
}

fs.rmSync(rulesDir, { recursive: true, force: true });
fs.mkdirSync(rulesDir, { recursive: true });

writeAdapted(path.join(upstream, 'AGENTS.md'), path.join(rulesDir, 'AGENTS-UPSTREAM.md'), rewritePaths, 'context');
for (const f of ['LLM-RULES.md', 'USER-RULES.md', 'memory.md', '.dev.env.example']) {
  const src = path.join(upstream, f);
  if (fs.existsSync(src)) writeAdapted(src, path.join(rulesDir, `upstream-${f}`), rewritePaths, 'context');
}
walkAdapted(path.join(upstream, 'content', 'rules'), path.join(rulesDir, 'rules'), adaptRule, 'rule');
walkAdapted(path.join(upstream, 'content', 'standards'), path.join(rulesDir, 'standards'), adaptStandard, 'standard');
walkAdapted(path.join(upstream, 'content', 'skills'), skillsDir, adaptSkill, 'skill');
walkAdapted(path.join(upstream, 'openspec'), path.join(rulesDir, 'openspec-reference'), rewritePaths, 'openspec-reference');
walkAdapted(path.join(upstream, 'content', 'openspec-bundle'), path.join(rulesDir, 'openspec-bundle-reference'), rewritePaths, 'openspec-reference');

const agentSrc = path.join(upstream, 'content', 'agents');
for (const f of fs.readdirSync(agentSrc).filter((x) => x.endsWith('.md'))) {
  writeAdapted(path.join(agentSrc, f), path.join(agentsDir, `1c-${f}`), adaptAgent, 'agent');
}
const cmdSrc = path.join(upstream, 'content', 'commands');
if (fs.existsSync(cmdSrc)) for (const f of fs.readdirSync(cmdSrc).filter((x) => x.endsWith('.md'))) {
  writeAdapted(path.join(cmdSrc, f), path.join(promptsDir, `1c-${f}`), adaptCommand, 'prompt');
}
walkAdapted(path.join(root, 'rules', 'core'), path.join(rulesDir, 'core'), rewritePaths, 'package-rule');

if (project) {
  const envExample = path.join(upstream, '.dev.env.example');
  const targetExample = path.join(projectRoot, '.dev.env.example');
  if (fs.existsSync(envExample) && !fs.existsSync(targetExample)) cp(envExample, targetExample);
  const projectSettings = path.join(stateDir, 'settings.json');
  let settings = {};
  try { if (fs.existsSync(projectSettings)) settings = JSON.parse(fs.readFileSync(projectSettings, 'utf8')); } catch {}
  settings.projectAgents = true;
  fs.writeFileSync(projectSettings, `${JSON.stringify(settings, null, 2)}\n`);
}

const managedBlock = fs.readFileSync(path.join(root, 'bootstrap', 'AGENTS.managed.md'), 'utf8').trim();
let current = fs.existsSync(contextFile) ? fs.readFileSync(contextFile, 'utf8') : '';
const start = '<!-- PI-1C-AGENT:BEGIN -->';
const end = '<!-- PI-1C-AGENT:END -->';
const re = new RegExp(`${start}[\\s\\S]*?${end}`, 'm');
const nextContext = current.includes(start) ? current.replace(re, managedBlock) : `${current.trim()}\n\n${managedBlock}\n`;
if (nextContext.trim() !== current.trim()) {
  if (fs.existsSync(contextFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(stateDir, 'backups', stamp, 'AGENTS.md');
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(contextFile, backup);
  }
  fs.mkdirSync(path.dirname(contextFile), { recursive: true });
  fs.writeFileSync(contextFile, `${nextContext.trim()}\n`);
}

const applied = { ...lock, appliedAt: new Date().toISOString(), sourceMode: explicitSource ? 'explicit' : 'pinned-fetch' };
fs.writeFileSync(path.join(stateDir, 'upstream.applied.json'), `${JSON.stringify(applied, null, 2)}\n`);
fs.writeFileSync(path.join(stateDir, 'UPSTREAM-MAPPING.json'), `${JSON.stringify(mapping, null, 2)}\n`);
fs.writeFileSync(manifestFile, `${JSON.stringify({ version: 2, scope: project ? 'project' : 'global', contextFile, managedFiles, upstreamCommit: lock.commit, generatedAt: new Date().toISOString() }, null, 2)}\n`);

console.log(`PASS: bootstrapped ${mapping.length} adapted upstream/package artifacts at ${lock.commit}`);
console.log(`PASS: agent files = ${mapping.filter((x) => x.kind === 'agent').length}`);
console.log(`PASS: mapping = ${path.join(stateDir, 'UPSTREAM-MAPPING.json')}`);
console.log('NOTE: project-local agents require both project trust and projectAgents=true.');

// Product: never inject memory / knowledge / 1C bundle ports into profile mcp.json.
// This script does not create or patch mcp.json; optional servers stay opt-in.
