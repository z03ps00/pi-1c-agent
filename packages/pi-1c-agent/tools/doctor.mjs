#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditKnowledge, loadConfiguration } from '../lib/knowledge.mjs';
import { collectRuntimeStatus, formatRuntimeStatus } from '../lib/runtime-status.mjs';
import { auditDevEnvSchema, initStatus, locateDevEnvExample } from '../lib/project-init.mjs';
import { dockerPolicyLabel } from '../lib/docker-policy.mjs';
import { MIN_NODE_VERSION, nodeMeetsMinimum } from '../lib/node-runtime.mjs';
import {
  bootstrapWritesOptionalMcp,
  inspectMcpJsonFile,
  listPackageShippedFiles,
  scanMachineLocalPaths,
  walkFiles,
} from '../lib/product-health.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const args = process.argv.slice(2);
const project = args.includes('--project');
const global = args.includes('--global');
const packageOnly = args.includes('--package-only');
const requireOpenSpec = args.includes('--require-openspec');
const jsonOutput = args.includes('--json');
if (!packageOnly && project === global) {
  console.error('FAIL: choose exactly one scope: --project or --global (or use --package-only)');
  process.exit(2);
}

const base = packageOnly ? null : (project ? path.resolve(process.cwd(), '.pi') : (process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), '.pi', 'agent')));
const stateDir = base ? path.join(base, '1c') : null;
const checks = [];
const add = (name, ok, required = true, details = '') => checks.push({ name, ok: Boolean(ok), required, details });
const exists = (p) => Boolean(p && fs.existsSync(p));
const read = (p) => fs.readFileSync(p, 'utf8');
function files(root, pred = () => true) {
  const out = [];
  if (!exists(root)) return out;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) out.push(...files(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
}
function frontmatterHas(raw, key) {
  if (!raw.startsWith('---\n')) return false;
  const end = raw.indexOf('\n---\n', 4);
  if (end < 0) return false;
  return new RegExp(`^${key}:\\s*`, 'm').test(raw.slice(4, end));
}
function commandVersion(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : null;
}

const packageJson = JSON.parse(read(path.join(packageRoot, 'package.json')));
const extList = packageJson?.pi?.extensions ?? [];
add('package version', packageJson.version === '0.6.1', true, packageJson.version);
add(`Node >=${MIN_NODE_VERSION}`, nodeMeetsMinimum(), true, process.version);
add('Pi peer ranges bounded', Object.values(packageJson.peerDependencies || {}).every((range) => range && range !== '*'), true, JSON.stringify(packageJson.peerDependencies));
add('1C PLAN/BUILD extension', exists(path.join(packageRoot, 'extensions', '1c-mode', 'index.ts')) && extList.includes('extensions/1c-mode/index.ts'));
add('1C subagent extension', exists(path.join(packageRoot, 'extensions', '1c-subagents', 'index.ts')) && extList.includes('extensions/1c-subagents/index.ts'));
add('1C admin extension', exists(path.join(packageRoot, 'extensions', '1c-admin', 'index.ts')) && extList.includes('extensions/1c-admin/index.ts'));
add('1C knowledge extension', exists(path.join(packageRoot, 'extensions', '1c-knowledge', 'index.ts')) && extList.includes('extensions/1c-knowledge/index.ts'));
add('1C project-init extension', exists(path.join(packageRoot, 'extensions', '1c-init', 'index.ts')) && extList.includes('extensions/1c-init/index.ts'));
add('1C session-rotate extension', exists(path.join(packageRoot, 'extensions', '1c-session-rotate', 'index.ts')) && extList.includes('extensions/1c-session-rotate/index.ts'));
add('1C memory lifecycle extension', exists(path.join(packageRoot, 'extensions', '1c-memory', 'index.ts')) && extList.includes('extensions/1c-memory/index.ts'));
const memorySrc = exists(path.join(packageRoot, 'extensions', '1c-memory', 'index.ts')) ? read(path.join(packageRoot, 'extensions', '1c-memory', 'index.ts')) : '';
add('canonical /memory-flush /wrap /capture-model', /registerCommand\("memory-flush"/.test(memorySrc) && /registerCommand\("wrap"/.test(memorySrc) && /registerCommand\("capture-model"/.test(memorySrc) && !/registerCommand\("1c-wrap"/.test(memorySrc));
add('memory write helpers', exists(path.join(packageRoot, 'lib', 'redact.mjs')) && exists(path.join(packageRoot, 'lib', 'memory-key.mjs')) && exists(path.join(packageRoot, 'lib', 'memory-reconcile.mjs')));
const rotateSrc = exists(path.join(packageRoot, 'extensions', '1c-session-rotate', 'index.ts')) ? read(path.join(packageRoot, 'extensions', '1c-session-rotate', 'index.ts')) : '';
add('canonical /session-rotate registration', /registerCommand\("session-rotate"/.test(rotateSrc) && !/registerCommand\("1c-session-rotate"/.test(rotateSrc));
const adminSrc = read(path.join(packageRoot, 'extensions', '1c-admin', 'index.ts'));
const initSrc = read(path.join(packageRoot, 'extensions', '1c-init', 'index.ts'));
add('deterministic /doctor registration', /registerCommand\("doctor"/.test(adminSrc) && !/registerCommand\("1c-doctor"/.test(adminSrc));
add('canonical /init registration', /registerCommand\("init"/.test(initSrc) && !/registerCommand\("1c-init"/.test(initSrc));
add('/init TUI first question empty vs from-IB', /Источник проекта \(первый вопрос \/init\)/.test(initSrc) && /Выгрузка из существующей ИБ/.test(initSrc));
add('43-variable .dev.env UX schema', (() => { try { const x = JSON.parse(read(path.join(packageRoot, 'config', 'dev-env.schema.json'))); return x.variables?.length === 43 && new Set(x.variables.map((v) => v.name)).size === 43; } catch { return false; } })());
add('configuration knowledge rule', exists(path.join(packageRoot, 'rules', 'core', 'knowledge.md')));
add('PLAN state-machine helper', exists(path.join(packageRoot, 'lib', 'plan-state.mjs')));
add('PLAN write policy helper', exists(path.join(packageRoot, 'lib', 'plan-policy.mjs')));
add('docker policy helper', exists(path.join(packageRoot, 'lib', 'docker-policy.mjs')));
add('product health helper', exists(path.join(packageRoot, 'lib', 'product-health.mjs')));
add('handoff validator', exists(path.join(packageRoot, 'lib', 'handoff.mjs')));
add('session-rotate helper', exists(path.join(packageRoot, 'lib', 'session-rotate.mjs')));
add('writer concurrency policy', exists(path.join(packageRoot, 'lib', 'agent-policy.mjs')));
add('runtime scheduler helper', exists(path.join(packageRoot, 'lib', 'runtime-scheduler.mjs')));
add('runtime status helper', exists(path.join(packageRoot, 'lib', 'runtime-status.mjs')));
add('pinned upstream lock', exists(path.join(packageRoot, 'upstream', 'UPSTREAM.lock.json')));

const packagePathHits = scanMachineLocalPaths(listPackageShippedFiles(packageRoot));
add('shipped package has no machine-local paths', packagePathHits.length === 0, true, packagePathHits.slice(0, 8).join(', '));
const bootstrapSrc = read(path.join(packageRoot, 'tools', 'bootstrap.mjs'));
add('bootstrap does not write optional MCP into mcp.json', !bootstrapWritesOptionalMcp(bootstrapSrc));
const packageMcp = inspectMcpJsonFile(path.join(packageRoot, 'mcp.json'));
add('package mcp.json has no unsolicited optional servers', packageMcp.issues.length === 0, true, packageMcp.exists ? packageMcp.issues.join(', ') : 'mcp.json absent');
add('docker policy', true, false, dockerPolicyLabel());

const selfTests = spawnSync(process.execPath, [path.join(packageRoot, 'tests', 'run-fast.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
add('package regression tests', selfTests.status === 0, true, selfTests.status === 0 ? 'PASS' : (selfTests.stderr || selfTests.stdout).slice(-1000));

if (!packageOnly) {
  add('Pi CLI', commandVersion('pi') !== null);
  const lock = JSON.parse(read(path.join(packageRoot, 'upstream', 'UPSTREAM.lock.json')));
  const appliedFile = path.join(stateDir, 'upstream.applied.json');
  let applied = null;
  try { if (exists(appliedFile)) applied = JSON.parse(read(appliedFile)); } catch {}
  add('bootstrap manifest', exists(path.join(stateDir, 'bootstrap.manifest.json')));
  add('pinned upstream commit applied', applied?.commit === lock.commit, true, applied?.commit ?? 'missing');

  const upstream = path.join(base, 'pi-1c-agent-upstream');
  add('upstream snapshot', exists(path.join(upstream, 'content')));
  add('adapted AGENTS', exists(path.join(base, 'rules-1c', 'AGENTS-UPSTREAM.md')));
  add('rules', exists(path.join(base, 'rules-1c', 'rules')));
  add('standards', exists(path.join(base, 'rules-1c', 'standards')));
  add('skills', exists(path.join(base, 'skills')));
  add('prompts', exists(path.join(base, 'prompts')));
  add('installed 1C mode rule', exists(path.join(base, 'rules-1c', 'core', 'modes.md')));

  const upstreamAgents = files(path.join(upstream, 'content', 'agents'), (p) => p.endsWith('.md'));
  const expectedAgentFiles = upstreamAgents.map((src) => `1c-${path.basename(src)}`);
  const adaptedCount = expectedAgentFiles.filter((name) => exists(path.join(base, 'agents', name))).length;
  add('agent decomposition count', upstreamAgents.length > 0 && adaptedCount === upstreamAgents.length, true, `${adaptedCount}/${upstreamAgents.length}`);
  if (lock.agentCount) add('locked agent count', upstreamAgents.length === lock.agentCount, true, `${upstreamAgents.length}/${lock.agentCount}`);

  const badRuleFM = [];
  for (const p of files(path.join(base, 'rules-1c', 'rules'), (p) => p.endsWith('.md'))) {
    const raw = read(p);
    for (const k of ['globs', 'category']) if (frontmatterHas(raw, k)) badRuleFM.push(`${p}:${k}`);
  }
  add('Pi rule frontmatter sanitized', badRuleFM.length === 0, true, badRuleFM.slice(0, 5).join(', '));

  const badPromptFM = [];
  for (const p of files(path.join(base, 'prompts'), (p) => p.endsWith('.md'))) {
    const raw = read(p);
    for (const k of ['argumentHint', 'allowedTools']) if (frontmatterHas(raw, k)) badPromptFM.push(`${p}:${k}`);
  }
  add('Pi prompt frontmatter sanitized', badPromptFM.length === 0, true, badPromptFM.slice(0, 5).join(', '));

  const residuePatterns = ['content/rules/', 'content/standards/', 'content/skills/', 'content/agents/', 'content/commands/', 'content/openspec-bundle/'];
  const residue = [];
  for (const root of [path.join(base, 'rules-1c'), path.join(base, 'agents'), path.join(base, 'skills'), path.join(base, 'prompts')]) {
    for (const p of files(root, (p) => /\.(md|txt|json|ya?ml)$/i.test(p))) {
      const raw = read(p);
      for (const pat of residuePatterns) if (raw.includes(pat)) residue.push(`${p}:${pat}`);
    }
  }
  add('no source-only content/* references', residue.length === 0, true, residue.slice(0, 8).join(', '));

  let tiersExpected = 0, tiersPreserved = 0, mcpExpected = 0, mcpPreserved = 0;
  for (const src of upstreamAgents) {
    const sourceRaw = read(src);
    const dst = path.join(base, 'agents', `1c-${path.basename(src)}`);
    const adaptedRaw = exists(dst) ? read(dst) : '';
    if (/^modelTier:/m.test(sourceRaw)) { tiersExpected++; if (/^modelTier:/m.test(adaptedRaw)) tiersPreserved++; }
    if (/\bMCP\b/.test(sourceRaw)) { mcpExpected++; if (/^capabilities:\s*.*mcp/im.test(adaptedRaw)) mcpPreserved++; }
  }
  add('subagent modelTier preserved', tiersPreserved === tiersExpected, true, `${tiersPreserved}/${tiersExpected}`);
  add('subagent MCP capability preserved', mcpPreserved === mcpExpected, true, `${mcpPreserved}/${mcpExpected}`);

  const mappingFile = path.join(stateDir, 'UPSTREAM-MAPPING.json');
  let mapping = [];
  try { if (exists(mappingFile)) mapping = JSON.parse(read(mappingFile)); } catch {}
  add('generated upstream mapping', Array.isArray(mapping) && mapping.length > 0, true, `${mapping.length} entries`);

  if (project) {
    const configKnowledge = loadConfiguration(process.cwd());
    add('configuration knowledge initialized', Boolean(configKnowledge), false, configKnowledge ? `${configKnowledge.name} ${configKnowledge.version}` : 'optional; use /config init in BUILD');
    if (configKnowledge) {
      add('configuration fingerprint present', Boolean(configKnowledge.fingerprint), true, configKnowledge.fingerprint ?? 'missing');
      const ka = auditKnowledge(process.cwd());
      add('knowledge conflicts', ka.conflicts.length === 0, false, `${ka.conflicts.length} conflict topic(s)`);
      add('knowledge stale items', ka.stale.length === 0, false, `${ka.stale.length} stale item(s)`);
    }

    const init = initStatus(process.cwd());
    add('project initialization completed', Boolean(init.state && init.envFile), false, init.state ? `${init.state.projectName ?? ''} / ${init.configuredCount} non-empty ENV values` : 'optional; run /init advanced');
    if (init.state?.sourceScaffoldEnabled) {
      add('standard 1C source scaffold', Boolean(init.scaffold?.complete), true, init.scaffold?.complete ? `${init.scaffold.root}/{cf,cfe,epf,erf}` : `missing: ${init.scaffold?.missing?.join(', ') || 'unknown'}`);
    } else if (init.state) {
      add('standard 1C source scaffold', false, false, 'disabled during /init');
    }
    if (init.state?.buildScaffoldEnabled) {
      add('compiled artifact build scaffold', Boolean(init.buildScaffold?.complete), true, init.buildScaffold?.complete ? 'build/{cf,cfe,epf,erf}' : `missing: ${init.buildScaffold?.missing?.join(', ') || 'unknown'}`);
    } else if (init.state) {
      add('compiled artifact build scaffold', false, false, 'disabled during /init');
    }
    if (init.state?.docsScaffoldEnabled) {
      add('docs/techtask scaffold', Boolean(init.docsScaffold?.complete), true, init.docsScaffold?.complete ? 'docs/ + docs/techtask' : `missing: ${init.docsScaffold?.missing?.join(', ') || 'unknown'}`);
    } else if (init.state) {
      add('docs/techtask scaffold', false, false, 'disabled during /init');
    }
    const example = locateDevEnvExample(process.cwd());
    if (example) {
      const envAudit = auditDevEnvSchema(read(example));
      add('.dev.env upstream/schema coverage', envAudit.unknown.length === 0 && envAudit.missing.length === 0 && envAudit.duplicates.length === 0, true, `${envAudit.discovered.length}/43; unknown=${envAudit.unknown.length}; missing=${envAudit.missing.length}`);
    } else {
      add('.dev.env upstream/schema coverage', false, true, 'template missing; rerun bootstrap');
    }

    const settingsFile = path.join(stateDir, 'settings.json');
    let projectAgents = false;
    try { projectAgents = JSON.parse(read(settingsFile))?.projectAgents === true; } catch {}
    add('project agents explicit opt-in', projectAgents, true, projectAgents ? 'enabled; runtime trust gate also required' : 'run /agent-scope on');
  }

  const runtime = collectRuntimeStatus({ profileDir: base, cwd: process.cwd() });
  add('runtime inflight children', true, false, String(runtime.inflightChildren));
  add('runtime lease directory', exists(path.join(base, 'state', 'runtime')), false, exists(path.join(base, 'state', 'runtime')) ? 'state/runtime' : 'not created yet');
  add('memory queue counts', true, false, `pending=${runtime.memory.pending} processing=${runtime.memory.processing} done=${runtime.memory.done} failed=${runtime.memory.failed}`);
  add('memory queue uniqueness', runtime.duplicateQueueIds.length === 0, true, runtime.duplicateQueueIds.length ? runtime.duplicateQueueIds.map((d) => `${d.id}:${d.count}`).join(', ') : 'ok');
  add('knowledge revision', true, false, String(runtime.knowledgeRevision));
  add('mcp session counters', true, false, `init=${runtime.mcp.initCount} reset=${runtime.mcp.resetCount}`);
  if (!jsonOutput) {
    // included in check details; keep formatRuntimeStatus available for operators
    void formatRuntimeStatus;
  }

  const openSpecVersion = commandVersion('openspec');
  const osDir = path.join(process.cwd(), 'openspec');
  const osSkills = path.join(process.cwd(), '.pi', 'skills');
  const osPrompts = path.join(process.cwd(), '.pi', 'prompts');
  const osSkillOk = exists(osSkills) && fs.readdirSync(osSkills, { withFileTypes: true }).some((e) => e.isDirectory() && e.name.startsWith('openspec-'));
  const osPromptOk = exists(osPrompts) && fs.readdirSync(osPrompts).some((n) => /^opsx-.*\.md$/.test(n));
  const openSpecProjectOk = Boolean(openSpecVersion && exists(osDir) && osSkillOk && osPromptOk);
  add('OpenSpec CLI', Boolean(openSpecVersion), requireOpenSpec, openSpecVersion ?? 'not installed');
  add('OpenSpec vanilla Pi project artifacts', openSpecProjectOk, requireOpenSpec, openSpecProjectOk ? 'openspec/ + .pi/skills + .pi/prompts' : 'optional; run /openspec-setup');

  const installedScanRoots = [
    path.join(base, 'rules-1c'),
    path.join(base, 'agents'),
    path.join(base, 'skills'),
    path.join(base, 'prompts'),
  ];
  const installedFiles = [
    ...installedScanRoots.flatMap((root) => walkFiles(root)),
    path.join(base, 'AGENTS.md'),
    path.join(base, 'settings.json'),
  ];
  const installedPathHits = scanMachineLocalPaths(installedFiles.filter((p) => exists(p)));
  add('installed files have no machine-local paths', installedPathHits.length === 0, true, installedPathHits.slice(0, 8).join(', '));
  const mcpPath = path.join(base, 'mcp.json');
  const installedMcp = inspectMcpJsonFile(mcpPath);
  add(
    'installed mcp.json has no leftover default optional servers',
    installedMcp.issues.length === 0,
    false,
    installedMcp.exists ? (installedMcp.issues.join(', ') || 'ok') : 'mcp.json absent',
  );
}

const fail = checks.some((c) => c.required && !c.ok);
if (jsonOutput) {
  console.log(JSON.stringify({ core: fail ? 'FAIL' : 'PASS', checks }, null, 2));
} else {
  for (const c of checks) console.log(`${c.ok ? 'PASS' : (c.required ? 'FAIL' : 'WARN')}  ${c.name}${c.details ? `  (${c.details})` : ''}`);
  console.log(`\nCORE: ${fail ? 'FAIL' : 'PASS'}`);
}
process.exit(fail ? 1 : 0);
