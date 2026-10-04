import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemKernel } from '../lib/harness/system-prompt.mjs';
import { formatCapabilitySummary, snapshotCapabilities } from '../lib/harness/capabilities.mjs';
import { createBudget, tryAdmit } from '../lib/harness/budget.mjs';
import { queueEvolutionMemory, observeFriction, approveDraft } from '../lib/harness/evolution.mjs';
import {
  approveLearnedSkill,
  evaluateSkillBundle,
  matchActiveWorkflows,
  queueLearningMemory,
  readLearningMode,
  recordSkillUse,
  reviewExperience,
  writeLearningMode,
} from '../lib/harness/learning.mjs';
import { assertTierWorkflows, selectTier } from '../lib/harness/promotion.mjs';
import { chooseSkills, mergeSkillCatalog, parseManifest, auditSkillManifests, indexManifests } from '../lib/harness/skills.mjs';
import { rankKnowledgeItems } from '../lib/harness/skills.mjs';
import { createStats, formatSessionStats } from '../lib/harness/stats.mjs';
import { renderContextView } from '../lib/harness/context-view.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = path.resolve(packageRoot, '..', '..');

test('kernel is present for the three modes and does not embed the rules snapshot', () => {
  const summary = formatCapabilitySummary(snapshotCapabilities([]));
  const kernel = buildSystemKernel({ packageRoot, capabilitySummary: summary });
  const upstream = fs.readFileSync(path.join(profileRoot, 'rules-1c', 'AGENTS-UPSTREAM.md'), 'utf8');
  const marker = upstream.split('\n').find((line) => line.startsWith('## ') && line.length > 12);
  for (const mode of ['ask', 'plan', 'build']) {
    const prompt = `${kernel}\n\n# 1C ${mode.toUpperCase()} MODE`;
    assert.match(prompt, /# 1C harness kernel/);
    assert.match(prompt, /structured metadata/);
    assert.match(prompt, new RegExp(mode.toUpperCase()));
    assert.doesNotMatch(prompt, /comol\/ai_rules_1c[\s\S]{200,}/);
    if (marker) assert.equal(prompt.includes(marker), false);
  }
  assert.match(kernel, /ASK is read-only/);
  assert.match(kernel, /Anonymous mode does not write shared memory/);
  assert.doesNotMatch(summary, /object_name/);
});

test('anonymous evolution does not queue shared memory', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'pi-1c-anon-'));
  const result = queueEvolutionMemory({
    profileDir: dir,
    draft: { id: 'skill-x', kind: 'skill', subject: 'repeat' },
    connected: true,
    anonLevel: 1,
  });
  assert.equal(result.queued, 0);
  assert.equal(fs.existsSync(path.join(dir, 'state', 'agent-memory', 'pending')), false);
});

test('unknown server id fills metadata.object and ib.query stays unavailable', () => {
  const snapshot = snapshotCapabilities([{
    server: 'acme-meta',
    name: 'get_object_dossier',
    description: 'object metadata passport',
  }]);
  const summary = formatCapabilitySummary(snapshot);
  assert.equal(snapshot['metadata.object'], true);
  assert.equal(snapshot['ib.query'], false);
  assert.match(summary, /metadata\.object = available/);
  assert.match(summary, /ib\.query = unavailable/);
  assert.doesNotMatch(summary, /acme-meta/);
});

test('budget keeps the kernel and drops a duplicate or oversized skill', () => {
  const budget = createBudget({ PI_1C_CONTEXT_BUDGET: '20' });
  const kernel = tryAdmit(budget, { id: 'kernel', bucket: 'kernel', text: 'safety kernel text', protect: true });
  assert.equal(kernel.admitted, true);
  const skill = tryAdmit(budget, { id: 'skill:big', bucket: 'skill', text: 'x'.repeat(400) });
  assert.equal(skill.admitted, false);
  assert.equal(skill.reason, 'over-budget');
  assert.equal(tryAdmit(budget, { id: 'kernel', bucket: 'kernel', text: 'again' }).reason, 'duplicate');
  assert.ok(budget.items.some((item) => item.id === 'kernel'));
});

test('draft knowledge is not ranked and a BUILD-only skill stays out of ASK', () => {
  const ranked = rankKnowledgeItems([
    { id: 'd', status: 'draft', kind: 'rule', scope: 'project', statement: 'draft rule about contracts' },
    { id: 'p', status: 'active', kind: 'rule', scope: 'project', statement: 'project rule about contracts' },
    { id: 'f', status: 'active', kind: 'fact', scope: 'configuration', confidence: 'verified', statement: 'verified fact about contracts' },
  ], 'contracts', { limit: 2 });
  assert.equal(ranked[0].id, 'p');
  assert.ok(ranked.every((item) => item.status === 'active'));
  const manifests = [
    parseManifest('id: meta\ntriggers:\n  - объект\nrequires:\n  any:\n    - metadata.object\nmodes:\n  - ask\n  - build\n'),
    parseManifest('id: writer\ntriggers:\n  - объект\nrequires:\n  any: []\nmodes:\n  - build\n'),
  ];
  const ask = chooseSkills({ manifests, text: 'объект', mode: 'ask', available: {} });
  assert.ok(ask.skipped.some((item) => item.id === 'meta' && /missing dependency/.test(item.reason)));
  assert.ok(ask.skipped.some((item) => item.id === 'writer'));
  assert.equal(ask.selected.length, 0);
  const build = chooseSkills({ manifests, text: 'объект', mode: 'build', available: { 'metadata.object': true } });
  assert.deepEqual(build.selected.map((item) => item.id).sort(), ['meta', 'writer']);
});

test('promotion stays on existing roles and raises tier for risk or an explicit review', () => {
  assert.equal(selectTier('Как устроен справочник?').tier, 0);
  assert.equal(selectTier('Где используется ОбщийМодуль.ОбменСЭДО?').tier, 0);
  const small = selectTier('Исправь одну процедуру в Module.bsl');
  assert.equal(small.tier, 1);
  assert.equal(small.syntaxCheckRequired, true);
  assert.equal(small.replacesMode, false);
  const review = selectTier('Исправь одну процедуру в Module.bsl и сделай архитектурный разбор');
  assert.ok(review.tier >= 3);
  const critical = selectTier('Исправь обмен и миграцию данных в прод');
  assert.equal(critical.tier, 4);
  assert.equal(critical.workflow, 'tier4');
  const checked = assertTierWorkflows(packageRoot);
  assert.deepEqual(checked.errors, []);
});

test('friction draft waits for the third repeat and approval does not claim activation', async () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'pi-1c-evo-'));
  const signal = { type: 'reviewer_finding', subject: 'password=supersecret same finding' };
  assert.equal((await observeFriction(dir, signal)).draft, null);
  assert.equal((await observeFriction(dir, signal)).draft, null);
  const third = observeFriction(dir, signal);
  assert.equal(third.draft.status, 'draft');
  assert.equal(third.activated, false);
  const journal = fs.readFileSync(path.join(dir, 'state', 'evolution', 'friction.json'), 'utf8');
  assert.equal(journal.includes('supersecret'), false);
  const { approveDraft } = await import('../lib/harness/evolution.mjs');
  const approved = approveDraft(dir, third.draft.id);
  assert.equal(approved.activated, false);
  assert.match(approved.message, /were not changed/);
});

test('session stats render counters and context view shows the source', () => {
  const stats = createStats();
  stats.structuralCalls = 2;
  const text = formatSessionStats(stats);
  assert.match(text, /Structural MCP calls: 2/);
  assert.doesNotMatch(text, /password/);
  const view = renderContextView({
    budget: createBudget({ PI_1C_CONTEXT_BUDGET: '100' }),
    loaded: { skills: ['1c-meta-info'], rules: [], knowledge: [] },
    skipped: [{ id: 'writer', reason: 'missing dependency: metadata.object' }],
    decision: { first: 'metadata.object' },
  });
  assert.match(view, /skills: 1c-meta-info/);
  assert.match(view, /source: metadata\.object/);
  assert.match(view, /missing dependency/);
});

test('every profile skill manifest has id and requires', () => {
  const audit = auditSkillManifests(path.join(profileRoot, 'skills'));
  assert.equal(audit.ok, true, audit.details);
});

function tempProfile() {
  return fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'pi-1c-learn-'));
}

const READONLY_PROCEDURE = {
  task: 'Обнови ЗУП поставщика и сохрани локальную дельту',
  tools: [{ name: 'read' }, { name: 'grep' }, { name: 'syntaxcheck' }],
  sessionMode: 'build',
};

test('learning mode defaults to safe and rejects unknown values', () => {
  const dir = tempProfile();
  assert.equal(readLearningMode(dir), 'safe');
  assert.equal(writeLearningMode(dir, 'auto').mode, 'auto');
  assert.equal(readLearningMode(dir), 'auto');
  assert.equal(writeLearningMode(dir, 'nope').ok, false);
  assert.equal(readLearningMode(dir), 'auto');
});

test('the second procedure trace writes no skill and off writes no draft', () => {
  const dir = tempProfile();
  const first = reviewExperience(dir, READONLY_PROCEDURE);
  const second = reviewExperience(dir, READONLY_PROCEDURE);
  assert.equal(first.created, false);
  assert.equal(second.created, false);
  assert.equal(fs.existsSync(path.join(dir, 'state', 'evolution', 'learned', 'skills')), false);
  writeLearningMode(dir, 'off');
  const signal = { type: 'reviewer_finding', subject: 'password=supersecret same finding' };
  assert.equal(observeFriction(dir, signal).draft, null);
  assert.equal(observeFriction(dir, signal).draft, null);
  const third = observeFriction(dir, signal);
  assert.equal(third.draft, null);
  assert.equal(third.count, 3);
  const tree = fs.readdirSync(path.join(dir, 'state', 'evolution'));
  assert.equal(tree.includes('drafts'), false);
  const dumped = fs.readFileSync(path.join(dir, 'state', 'evolution', 'friction.json'), 'utf8');
  assert.equal(dumped.includes('supersecret'), false);
});

test('safe keeps a passing bundle inactive until approve and auto skips a configuration load', () => {
  const safeDir = tempProfile();
  let last;
  for (let i = 0; i < 3; i += 1) last = reviewExperience(safeDir, READONLY_PROCEDURE);
  assert.equal(last.created, true);
  assert.equal(last.activated, false);
  const manifests = indexManifests(path.join(safeDir, 'state', 'evolution', 'learned', 'skills'));
  const choice = chooseSkills({ manifests, text: 'обнови зуп', mode: 'build', available: {} });
  assert.equal(choice.selected.length, 0);
  assert.ok(choice.skipped.some((item) => item.reason === 'draft'));
  const approved = approveLearnedSkill(safeDir, last.id);
  assert.equal(approved.activated, true);
  assert.match(approved.message, new RegExp(last.id));
  const active = chooseSkills({
    manifests: indexManifests(path.join(safeDir, 'state', 'evolution', 'learned', 'skills')),
    text: 'обнови зуп',
    mode: 'build',
    available: {},
  });
  assert.deepEqual(active.selected.map((item) => item.id), [last.id]);
  const stub = approveDraft(safeDir, 'missing-stub');
  assert.equal(stub.ok, false);

  const autoDir = tempProfile();
  writeLearningMode(autoDir, 'auto');
  let activated;
  for (let i = 0; i < 3; i += 1) activated = reviewExperience(autoDir, READONLY_PROCEDURE);
  assert.equal(activated.activated, true);
  assert.match(activated.message, /is active/);
  const loaded = parseManifest(fs.readFileSync(path.join(autoDir, 'state', 'evolution', 'learned', 'skills', activated.id, 'manifest.yaml'), 'utf8'));
  assert.equal(loaded.status, 'active');
  assert.equal(loaded.quality, 'candidate');
  assert.equal(loaded.learning.successes, 0);

  const loadDir = tempProfile();
  writeLearningMode(loadDir, 'auto');
  const loading = {
    task: 'Загрузи расширение в тестовую базу',
    tools: [{ name: 'read' }, { name: 'grep' }, { name: 'bash', input: { command: 'ЗагрузитьИнформационнуюБазу' } }],
  };
  let held;
  for (let i = 0; i < 3; i += 1) held = reviewExperience(loadDir, loading);
  assert.equal(held.activated, false);
  assert.equal(parseManifest(fs.readFileSync(path.join(loadDir, 'state', 'evolution', 'learned', 'skills', held.id, 'manifest.yaml'), 'utf8')).status, 'draft');
  const broken = path.join(loadDir, 'state', 'evolution', 'learned', 'skills', held.id, 'SKILL.md');
  fs.writeFileSync(broken, '# broken\n');
  const refused = approveLearnedSkill(loadDir, held.id);
  assert.equal(refused.activated, false);
  assert.match(refused.reason, /SKILL.md/);
});

test('fact, decision, pipeline and lesson stay drafts in auto', () => {
  const dir = tempProfile();
  const project = path.join(dir, 'project');
  fs.mkdirSync(project);
  writeLearningMode(dir, 'auto');
  fs.mkdirSync(path.join(dir, 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflows', 'tier2.yaml'), 'name: tier2\n');
  const fact = reviewExperience(dir, { task: 'В ERP регистр Хозрасчетный используется для остатков' }, { cwd: project, mode: 'auto' });
  const decision = reviewExperience(dir, { task: 'Новые объекты создаём только в расширении CompanyExt' }, { cwd: project, mode: 'auto' });
  const pipeline = reviewExperience(dir, { task: 'Интеграция', roles: ['explorer', 'architect', 'developer', 'tester'] }, { mode: 'auto' });
  const lesson = reviewExperience(dir, { task: 'Нельзя выгружать всё расширение', verification: 'fail', tools: [{ name: 'read' }] }, { mode: 'auto' });
  assert.equal(fact.activated, false);
  assert.equal(decision.activated, false);
  assert.equal(pipeline.activated, false);
  assert.equal(lesson.activated, false);
  const drafts = fs.readdirSync(path.join(project, '.pi', '1c', 'knowledge-drafts'));
  assert.equal(drafts.length, 2);
  const factDraft = JSON.parse(fs.readFileSync(path.join(project, '.pi', '1c', 'knowledge-drafts', drafts.find((name) => name.endsWith('.json'))), 'utf8'));
  assert.equal(factDraft.status, 'pending');
  assert.equal(fs.existsSync(path.join(project, 'USER-RULES.md')), false);
  const items = path.join(project, '.pi', '1c', 'knowledge', 'items');
  assert.deepEqual(fs.existsSync(items) ? fs.readdirSync(items) : [], []);
  const lessonFile = fs.readdirSync(path.join(dir, 'state', 'evolution', 'learned', 'lessons'))[0];
  assert.match(fs.readFileSync(path.join(dir, 'state', 'evolution', 'learned', 'lessons', lessonFile), 'utf8'), /status: draft/);
  const workflowFile = fs.readdirSync(path.join(dir, 'state', 'evolution', 'learned', 'workflows'))[0];
  assert.match(fs.readFileSync(path.join(dir, 'state', 'evolution', 'learned', 'workflows', workflowFile), 'utf8'), /status: draft/);
  assert.equal(fs.readFileSync(path.join(dir, 'workflows', 'tier2.yaml'), 'utf8'), 'name: tier2\n');
  assert.equal(selectTier('Исправь одну процедуру в Module.bsl').workflow, 'tier1');
});

test('learned skill index skips drafts and shipped id collisions, and two failures deactivate', () => {
  const shipped = [{ id: 'meta', status: 'active', triggers: ['объект'], requires: { any: [], all: [] }, modes: ['build'], cost: 'low' }];
  const learned = [
    { id: 'meta', status: 'active', triggers: ['объект'], requires: { any: [], all: [] }, modes: ['build'], cost: 'low' },
    { id: 'local', status: 'draft', triggers: ['объект'], requires: { any: [], all: [] }, modes: ['build'], cost: 'low' },
    { id: 'ready', status: 'active', triggers: ['объект'], requires: { any: [], all: [] }, modes: ['build'], cost: 'low' },
  ];
  const merged = mergeSkillCatalog(shipped, learned);
  assert.deepEqual(merged.collisions, [{ id: 'meta', reason: 'shipped skill id' }]);
  const choice = chooseSkills({ manifests: merged.manifests, text: 'объект', mode: 'build', available: {} });
  assert.deepEqual(choice.selected.map((item) => item.id).sort(), ['meta', 'ready']);
  assert.ok(choice.skipped.some((item) => item.id === 'local' && item.reason === 'draft'));

  const dir = tempProfile();
  writeLearningMode(dir, 'auto');
  let created;
  for (let i = 0; i < 3; i += 1) created = reviewExperience(dir, READONLY_PROCEDURE);
  recordSkillUse(dir, created.id, 'failure');
  const second = recordSkillUse(dir, created.id, 'failure');
  assert.equal(second.status, 'deactivated');
  const after = chooseSkills({
    manifests: indexManifests(path.join(dir, 'state', 'evolution', 'learned', 'skills')),
    text: 'обнови зуп',
    mode: 'build',
    available: {},
  });
  assert.equal(after.selected.length, 0);
  assert.ok(fs.existsSync(path.join(dir, 'state', 'evolution', 'learned', 'skills', created.id, 'SKILL.md')));
  const parsed = parseManifest(fs.readFileSync(path.join(dir, 'state', 'evolution', 'learned', 'skills', created.id, 'manifest.yaml'), 'utf8'));
  assert.equal(parsed.learning.failures, 2);
  assert.equal(evaluateSkillBundle(path.join(dir, 'state', 'evolution', 'learned', 'skills', created.id)).ok, true);
});

test('a shipped manifest without status stays active and memory stays queued', () => {
  const parsed = parseManifest('id: meta\ntriggers:\n  - объект\nrequires:\n  any: []\nmodes:\n  - build\nquality:\n  level: verified\n');
  assert.equal(parsed.status, 'active');
  assert.equal(parsed.quality, 'verified');
  assert.equal(parsed.learning.successes, 0);
  const dir = tempProfile();
  const skipped = queueLearningMemory({ profileDir: dir, candidate: { id: 'x', type: 'skill' }, connected: false });
  assert.equal(skipped.queued, 0);
  const queued = queueLearningMemory({ profileDir: dir, candidate: { id: 'x', type: 'skill', message: 'draft' }, connected: true, cwd: dir });
  assert.equal(queued.queued, 2);
  const pending = fs.readdirSync(path.join(dir, 'state', 'agent-memory', 'pending'));
  assert.equal(pending.length, 2);
});

test('three successful uses verify a learned skill', () => {
  const dir = tempProfile();
  writeLearningMode(dir, 'auto');
  let created;
  const experience = { ...READONLY_PROCEDURE, task: 'Собери отчёт по остаткам регистра партии' };
  for (let i = 0; i < 3; i += 1) created = reviewExperience(dir, experience);
  assert.equal(recordSkillUse(dir, created.id, 'success').quality, 'experimental');
  recordSkillUse(dir, created.id, 'success');
  const third = recordSkillUse(dir, created.id, 'success');
  assert.equal(third.quality, 'verified');
  assert.equal(third.learning.successes, 3);
});

test('active learned workflow is admitted and a draft workflow is not', () => {
  const dir = tempProfile();
  const root = path.join(dir, 'state', 'evolution', 'learned', 'workflows');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'draft.yaml'), 'name: draft\nstatus: draft\ntriggers:\n  - зуп\nstages:\n  - 1c-developer\n');
  fs.writeFileSync(path.join(root, 'live.yaml'), 'name: live\nstatus: active\ntriggers:\n  - зуп\nstages:\n  - 1c-developer\n');
  const hits = matchActiveWorkflows(dir, 'обнови зуп');
  assert.deepEqual(hits.map((item) => item.id), ['live']);
  assert.equal(matchActiveWorkflows(dir, 'другая задача').length, 0);
});
