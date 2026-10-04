import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';
import { classifyDanger } from '../../packages/pi-1c-agent/lib/approve-policy.mjs';
import { snapshotCapabilities } from '../../packages/pi-1c-agent/lib/harness/capabilities.mjs';
import { createBudget, tryAdmit } from '../../packages/pi-1c-agent/lib/harness/budget.mjs';
import { renderContextView } from '../../packages/pi-1c-agent/lib/harness/context-view.mjs';
import { approveDraft, observeFriction, queueEvolutionMemory } from '../../packages/pi-1c-agent/lib/harness/evolution.mjs';
import { selectTier } from '../../packages/pi-1c-agent/lib/harness/promotion.mjs';
import {
  applyDecisionStats,
  decide,
  interpretLookup,
  shouldBlockTool,
} from '../../packages/pi-1c-agent/lib/harness/router.mjs';
import { resetSessionForTests } from '../../packages/pi-1c-agent/lib/harness/session.mjs';
import { chooseSkills, indexManifests } from '../../packages/pi-1c-agent/lib/harness/skills.mjs';
import { buildSystemKernel } from '../../packages/pi-1c-agent/lib/harness/system-prompt.mjs';
import { createStats, formatSessionStats, notePromotion } from '../../packages/pi-1c-agent/lib/harness/stats.mjs';
import { requireBuild, resetModeStateForTests, set1cMode } from '../../packages/pi-1c-agent/lib/mode-state.mjs';
import { evaluateReadOnlyToolCall } from '../../packages/pi-1c-agent/lib/plan-policy.mjs';
import { loadWorkflows, resetWorkflowCacheForTests } from '../../packages/pi-1c-agent/lib/workflows.mjs';

const root = profileRoot();
const packageRoot = path.join(root, 'packages', 'pi-1c-agent');
const graph = { 'graph.usages': true, 'metadata.object': true, 'code.fragment': true };

test('scenario: structural question uses graph and blocks a wide grep', () => {
  resetSessionForTests();
  const decision = decide({
    text: 'Где используется ОбщийМодуль.ОбменСЭДО?',
    capabilities: graph,
  });
  assert.equal(decision.first, 'graph.usages');
  const blocked = shouldBlockTool({
    decision,
    toolName: 'grep',
    input: { pattern: 'ОбменСЭДО' },
    structuralCallSeen: false,
  });
  assert.equal(blocked.block, true);
  const stats = createStats();
  applyDecisionStats(stats, decision);
  assert.equal(stats.fallbacks, 0);
  assert.equal(selectTier('Где используется ОбщийМодуль.ОбменСЭДО?').tier, 0);
});

test('scenario: named module is read at once and a small fix stays tier 1', () => {
  const text = 'Исправь процедуру Рассчитать в src/CommonModules/Расчет/Module.bsl';
  const decision = decide({ text, capabilities: graph });
  assert.equal(decision.first, 'working_tree_file');
  assert.equal(decision.allowRead, true);
  assert.equal(shouldBlockTool({ decision, toolName: 'read', input: { path: decision.namedFile } }), null);
  const tier = selectTier(text);
  assert.equal(tier.tier, 1);
  assert.equal(tier.workflow, 'tier1');
  assert.equal(tier.syntaxCheckRequired, true);
  assert.equal(tier.replacesMode, false);
});

test('scenario: missing graph falls back once, empty success does not', () => {
  const missing = decide({ text: 'Кто вызывает Процедура Рассчитать?', capabilities: {} });
  assert.equal(missing.fallback, true);
  assert.equal(missing.first, 'bounded_file_search');
  const stats = createStats();
  applyDecisionStats(stats, missing);
  assert.equal(stats.fallbacks, 1);
  const empty = interpretLookup({ capabilityAvailable: true, ok: true, matchCount: 0 });
  assert.equal(empty.outcome, 'not_found');
  assert.equal(empty.allowBroadGrep, false);
});

test('scenario: dirty working copy, OpenSpec and a customer rule keep their sources', () => {
  const dirty = decide({
    text: 'Что делает процедура X в src/CommonModules/X/Module.bsl',
    capabilities: graph,
    namedFile: 'src/CommonModules/X/Module.bsl',
    workingCopyNewer: true,
  });
  assert.equal(dirty.indexStale, true);
  assert.equal(dirty.first, 'working_tree_file');
  const spec = decide({ text: 'Поправь openspec/changes/x/proposal.md', capabilities: graph });
  assert.equal(spec.blockBroadGrepUntilStructural, false);
  const local = decide({ text: 'Как в этой конфигурации проводится реализация?', capabilities: graph });
  assert.equal(local.first, 'configuration_knowledge');
});

test('scenario: kernel stays short, budget keeps it, and a skill loads only when the capability exists', () => {
  const kernel = buildSystemKernel({
    packageRoot,
    capabilitySummary: 'metadata.object = available\nib.query = unavailable',
  });
  assert.match(kernel, /1C harness kernel/);
  assert.match(kernel, /structured metadata/);
  assert.doesNotMatch(kernel, /acme-meta/);
  const upstream = fs.readFileSync(path.join(root, 'rules-1c', 'AGENTS-UPSTREAM.md'), 'utf8');
  const heading = upstream.split('\n').find((line) => line.startsWith('## ') && line.length > 20);
  if (heading) assert.equal(kernel.includes(heading), false);

  const budget = createBudget({ PI_1C_CONTEXT_BUDGET: '30' });
  assert.equal(tryAdmit(budget, { id: 'kernel', bucket: 'kernel', text: kernel.slice(0, 40), protect: true }).admitted, true);
  assert.equal(tryAdmit(budget, { id: 'skill:huge', bucket: 'skill', text: 'x'.repeat(800) }).reason, 'over-budget');

  const manifests = indexManifests(path.join(root, 'skills'));
  const ask = chooseSkills({
    manifests,
    text: '1c-meta-info паспорт объекта метаданных',
    mode: 'ask',
    available: {},
  });
  assert.ok(ask.skipped.some((item) => item.id === '1c-meta-info' && /missing dependency/.test(item.reason)));
  const ready = chooseSkills({
    manifests,
    text: 'паспорт объекта метаданных 1c-meta-info',
    mode: 'ask',
    available: { 'metadata.object': true },
  });
  assert.ok(ready.selected.some((item) => item.id === '1c-meta-info'));
  const writer = chooseSkills({
    manifests,
    text: '1c-metadata-manage создай справочник',
    mode: 'ask',
    available: { 'metadata.object': true, 'metadata.tree': true },
  });
  assert.ok(writer.skipped.some((item) => item.id === '1c-metadata-manage'));
  assert.ok(!writer.selected.some((item) => item.id === '1c-metadata-manage'));
});

test('scenario: capability snapshot ignores the server id', () => {
  const snapshot = snapshotCapabilities([{
    server: 'acme-meta',
    name: 'get_object_dossier',
    description: 'object metadata passport',
  }]);
  assert.equal(snapshot['metadata.object'], true);
  assert.equal(snapshot['ib.query'], false);
  const view = renderContextView({
    budget: createBudget(),
    loaded: { skills: [], rules: [], knowledge: [] },
    skipped: [],
    decision: { first: 'metadata.object' },
  });
  assert.match(view, /source: metadata\.object/);
  assert.doesNotMatch(view, /acme-meta/);
});

test('scenario: evolution draft is not activated and anonymous mode does not queue memory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-1c-scenario-'));
  const signal = { type: 'bsl_error', subject: 'same BSL error password=supersecret' };
  assert.equal(observeFriction(dir, signal).draft, null);
  assert.equal(observeFriction(dir, signal).draft, null);
  const third = observeFriction(dir, signal);
  assert.equal(third.activated, false);
  assert.equal(third.draft.status, 'draft');
  const stored = fs.readFileSync(path.join(dir, 'state', 'evolution', 'friction.json'), 'utf8');
  assert.equal(stored.includes('supersecret'), false);
  const approved = approveDraft(dir, third.draft.id);
  assert.equal(approved.activated, false);
  assert.match(approved.message, /were not changed/);
  const queued = queueEvolutionMemory({
    profileDir: dir,
    draft: third.draft,
    connected: true,
    anonLevel: 1,
  });
  assert.equal(queued.queued, 0);
  assert.equal(fs.existsSync(path.join(dir, 'skills')), false);
});

test('scenario: session stats stay local and promotion is recorded on them', () => {
  const stats = createStats();
  notePromotion(stats, selectTier('Исправь обмен и миграцию в прод').tier);
  assert.equal(stats.lastPromotionTier, 4);
  const text = formatSessionStats(stats);
  assert.match(text, /Session efficiency/);
  assert.doesNotMatch(text, /Cognee|OpenViking|remember/);
});

test('scenario: old modes, workflows and approval still hold', () => {
  resetModeStateForTests();
  assert.throws(() => requireBuild('workflow_1c execution'), /BUILD/);
  set1cMode('ask');
  const askWrite = evaluateReadOnlyToolCall('ask', root, 'write', { path: 'src/Module.bsl' });
  assert.equal(askWrite.allowed, false);
  const planBash = evaluateReadOnlyToolCall('plan', root, 'bash', { command: 'rm -rf .' });
  assert.equal(planBash.allowed, false);
  const planSpec = evaluateReadOnlyToolCall('plan', root, 'write', { path: 'openspec/changes/x/proposal.md' });
  assert.equal(planSpec.allowed, true);
  set1cMode('build');
  assert.equal(requireBuild('workflow_1c execution'), true);
  const danger = classifyDanger('write', { path: 'src/Module.bsl' }, root);
  assert.equal(danger.dangerous, true);

  resetWorkflowCacheForTests();
  const workflows = loadWorkflows(packageRoot);
  assert.equal(workflows.get('feature').stages.at(-1).type, 'verification');
  assert.ok(workflows.has('bugfix'));
  assert.ok(workflows.has('architecture'));
  assert.equal(workflows.get('tier4').stages.some((stage) => stage.agent === '1c-analytic'), true);
  assert.equal(workflows.get('tier1').stages[0].agent, '1c-developer');
  resetModeStateForTests();
});

test('scenario: profile contract, commands and doctor still pass', () => {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Install from scratch/);
  assert.match(agents, /structured metadata/);
  assert.match(agents, /ASK answers questions/);
  assert.match(agents, /Anonymous session/);
  assert.doesNotMatch(agents, /1c-graph-metadata-mcp/);
  const router = fs.readFileSync(path.join(packageRoot, 'extensions', '1c-context-router', 'index.ts'), 'utf8');
  for (const name of ['capabilities', 'context', 'evolve', 'learning', 'session-stats']) {
    assert.match(router, new RegExp(`registerCommand\\("${name}"`));
    assert.equal(fs.existsSync(path.join(root, 'prompts', `${name}.md`)), false);
    assert.doesNotMatch(router, new RegExp(`registerCommand\\("1c-${name}"`));
  }
  const doctor = spawnSync(process.execPath, ['tools/doctor.mjs', '--package-only'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  assert.equal(doctor.status, 0, doctor.stdout || doctor.stderr);
  assert.match(doctor.stdout, /CORE: PASS/);
  assert.match(doctor.stdout, /profile skill manifests/);
});
