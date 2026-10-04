import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDecisionStats,
  classifyIntent,
  decide,
  interpretLookup,
  legacyGrepFirst,
  shouldBlockTool,
  workingCopyWins,
} from '../lib/harness/router.mjs';
import { createStats } from '../lib/harness/stats.mjs';

const graph = { 'graph.usages': true, 'code.fragment': true, 'metadata.object': true };

test('usages go to graph before grep', () => {
  const decision = decide({ text: 'Где используется ОбщийМодуль.ОбменСЭДО?', capabilities: graph });
  assert.equal(decision.intent, 'usages');
  assert.equal(decision.first, 'graph.usages');
  assert.equal(decision.blockBroadGrepUntilStructural, true);
  assert.equal(legacyGrepFirst(decision.intent), 'broad_grep');
  assert.notEqual(decision.first, 'broad_grep');
  const block = shouldBlockTool({ decision, toolName: 'grep', input: { pattern: 'ОбменСЭДО' }, structuralCallSeen: false });
  assert.equal(block.block, true);
  assert.equal(shouldBlockTool({ decision, toolName: 'grep', input: { pattern: 'ОбменСЭДО' }, structuralCallSeen: true }), null);
});

test('a named module is read immediately', () => {
  const decision = decide({ text: 'Исправь процедуру Рассчитать в src/CommonModules/Расчет/Module.bsl', capabilities: graph });
  assert.equal(decision.intent, 'known_file_edit');
  assert.equal(decision.first, 'working_tree_file');
  assert.equal(decision.allowRead, true);
  assert.equal(decision.blockBroadGrepUntilStructural, false);
  assert.equal(shouldBlockTool({ decision, toolName: 'read', input: { path: 'src/CommonModules/X/Module.bsl' } }), null);
});

test('unavailable graph records one bounded fallback', () => {
  const decision = decide({ text: 'Где используется ОбщийМодуль.X?', capabilities: {} });
  assert.equal(decision.first, 'bounded_file_search');
  assert.equal(decision.fallback, true);
  const stats = createStats();
  applyDecisionStats(stats, decision);
  applyDecisionStats(stats, { ...decision, fallback: false });
  assert.equal(stats.fallbacks, 1);
  const lookup = interpretLookup({ capabilityAvailable: false, ok: false, matchCount: 0 });
  assert.equal(lookup.outcome, 'unavailable');
  assert.equal(lookup.fallback, true);
});

test('empty structural success is not found and does not open a second grep', () => {
  const lookup = interpretLookup({ capabilityAvailable: true, ok: true, matchCount: 0 });
  assert.equal(lookup.outcome, 'not_found');
  assert.equal(lookup.allowBroadGrep, false);
  const decision = decide({ text: 'Где используется ОбщийМодуль.X?', capabilities: graph });
  decision.blockBroadGrepUntilStructural = lookup.allowBroadGrep ? decision.blockBroadGrepUntilStructural : true;
  assert.equal(shouldBlockTool({
    decision: { ...decision, blockBroadGrepUntilStructural: true },
    toolName: 'grep',
    input: { pattern: 'X' },
    structuralCallSeen: false,
  }).block, true);
});

test('a dirty working copy beats the index', () => {
  assert.equal(workingCopyWins({
    workingCopyNewer: true,
    indexSignature: 'Процедура X()',
    diskSignature: 'Процедура X(НовыйПараметр)',
  }), true);
  const decision = decide({
    text: 'Где используется процедура X в src/CommonModules/X/Module.bsl',
    capabilities: graph,
    workingCopyNewer: true,
    namedFile: 'src/CommonModules/X/Module.bsl',
  });
  assert.equal(decision.indexStale, true);
  assert.equal(decision.first, 'working_tree_file');
});

test('OpenSpec, JSON, and TODO skip the structural gate', () => {
  for (const text of ['поправь openspec/changes/x/proposal.md', 'найди TODO в модуле', 'прочитай config/dev-env.schema.json']) {
    const decision = decide({ text, capabilities: graph });
    assert.equal(decision.blockBroadGrepUntilStructural, false, text);
    assert.equal(classifyIntent(text) === 'usages', false);
  }
});

test('structural fixtures do not choose broad grep while the capability is live', () => {
  const fixtures = [
    'Где используется ОбщийМодуль.ОбменСЭДО?',
    'Кто вызывает Процедура Рассчитать?',
    'Покажи реквизит Контрагент документа Заказ',
  ];
  for (const text of fixtures) {
    const decision = decide({ text, capabilities: graph });
    assert.notEqual(decision.first, legacyGrepFirst(decision.intent));
    assert.notEqual(decision.first, 'broad_grep');
  }
});
