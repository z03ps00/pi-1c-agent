import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemKernel } from '../lib/harness/system-prompt.mjs';
import { formatCapabilitySummary, snapshotCapabilities } from '../lib/harness/capabilities.mjs';
import { createBudget, tryAdmit } from '../lib/harness/budget.mjs';
import { queueEvolutionMemory, observeFriction } from '../lib/harness/evolution.mjs';
import { assertTierWorkflows, selectTier } from '../lib/harness/promotion.mjs';
import { chooseSkills, parseManifest, auditSkillManifests } from '../lib/harness/skills.mjs';
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
