import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyDraft, auditDraft, auditKnowledge, automaticInvalidations, computeConfigurationCandidate, createDraft,
  diffFingerprint, findItem, initConfiguration, loadConfiguration, loadAllItems, normalizeProposal, precedenceOf, queryKnowledge, versionMatches,
} from '../lib/knowledge.mjs';

function tempProject() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-knowledge-'));
  fs.mkdirSync(path.join(cwd, 'src'), {recursive:true});
  fs.writeFileSync(path.join(cwd, 'src', 'Module.bsl'), 'Процедура Тест()\nКонецПроцедуры\n');
  fs.writeFileSync(path.join(cwd, 'src', 'Other.bsl'), 'Процедура Другая()\nКонецПроцедуры\n');
  return cwd;
}

test('configuration init stores version and fingerprint', () => {
  const cwd = tempProject();
  const cfg = initConfiguration(cwd, {name:'ERP 2.5', version:'2.5.25.56', sourceRoot:'src'});
  assert.equal(cfg.name, 'ERP 2.5');
  assert.ok(cfg.fingerprint);
  assert.equal(loadConfiguration(cwd).version, '2.5.25.56');
});

test('draft approval activates facts and project rules with precedence', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP 2.5', version:'2.5.25.56', sourceRoot:'src'});
  const draft = createDraft(cwd, {source:'user', input:'rules', proposals:[
    {action:'add', kind:'fact', scope:'configuration', topic:'posting', statement:'Document uses common posting module', confidence:'verified', evidence:[{type:'source',path:'src/Module.bsl'}]},
    {action:'add', kind:'rule', scope:'configuration', topic:'extensions', statement:'Prefer extension for vendor objects', confidence:'high'},
    {action:'add', kind:'rule', scope:'project', topic:'extensions', statement:'All changes must use FSK_Extension', confidence:'verified', evidence:[{type:'user',note:'explicit project policy'}]},
  ]});
  const applied = applyDraft(cwd, draft.id);
  assert.equal(applied.results.filter((x)=>x.action==='add').length, 3);
  const items = queryKnowledge(cwd, 'extensions', {limit:10});
  const projectRule = items.find((x)=>x.scope==='project');
  const configRule = items.find((x)=>x.scope==='configuration' && x.kind==='rule');
  assert.ok(precedenceOf(projectRule) > precedenceOf(configRule));
});

test('audit detects rule conflicts and evidence problems', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP', version:'2.5', sourceRoot:'src'});
  const draft = createDraft(cwd, {proposals:[
    {action:'add', kind:'rule', scope:'configuration', topic:'change-policy', statement:'Modify vendor configuration directly', confidence:'high'},
    {action:'add', kind:'rule', scope:'project', topic:'change-policy', statement:'Never modify vendor configuration directly', confidence:'high'},
  ]});
  applyDraft(cwd, draft.id);
  const audit = auditKnowledge(cwd);
  assert.equal(audit.conflicts.length, 1);
  assert.equal(audit.conflicts[0].winner.includes('project.rule'), true);
});

test('configuration update diff can propose evidence invalidation without applying it', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP', version:'2.5.1', sourceRoot:'src'});
  const draft = createDraft(cwd, {proposals:[
    {action:'add', kind:'fact', scope:'configuration', topic:'module', statement:'Module contains procedure Test', confidence:'verified', evidence:[{type:'source',path:'Module.bsl'}], appliesTo:{paths:['Module.bsl']}},
  ]});
  applyDraft(cwd, draft.id);
  fs.appendFileSync(path.join(cwd, 'src', 'Module.bsl'), '// changed\n');
  const candidate = computeConfigurationCandidate(cwd, {version:'2.5.2'});
  assert.ok(candidate.diff.changed.includes('Module.bsl'));
  const invalidations = automaticInvalidations(cwd, candidate.diff.changed);
  assert.equal(invalidations.length, 1);
  assert.equal(findItem(cwd, invalidations[0].targetId).status, 'active');
});

test('fingerprint diff reports added removed modified', () => {
  const d = diffFingerprint({a:{size:1},b:{size:1}}, {a:{size:2},c:{size:1}});
  assert.deepEqual(d.modified, ['a']);
  assert.deepEqual(d.removed, ['b']);
  assert.deepEqual(d.added, ['c']);
});


test('draft is not canonical until explicit approval and query exposes real precedence', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP', version:'2.5.25.56', sourceRoot:'src'});
  const draft = createDraft(cwd, {proposals:[
    {action:'add', kind:'rule', scope:'project', topic:'write-policy', statement:'Use extension only', confidence:'verified', evidence:[{type:'user',note:'explicit'}]},
  ]});
  assert.equal(loadAllItems(cwd).length, 0);
  assert.equal(queryKnowledge(cwd, 'extension').length, 0);
  applyDraft(cwd, draft.id);
  const result = queryKnowledge(cwd, 'extension')[0];
  assert.ok(result._precedence >= 900);
  assert.ok(result._score > 0);
});

test('verified canonical item without evidence is rejected before any partial apply', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP', version:'2.5.25.56', sourceRoot:'src'});
  const draft = createDraft(cwd, {proposals:[
    {action:'add', kind:'rule', scope:'project', topic:'bad', statement:'First valid rule', confidence:'high'},
    {action:'add', kind:'fact', scope:'configuration', topic:'bad-fact', statement:'Unproven fact', confidence:'verified', evidence:[]},
  ]});
  const review = auditDraft(cwd, draft);
  assert.equal(review.ok, false);
  assert.throws(() => applyDraft(cwd, draft.id), /verified item requires evidence/i);
  assert.equal(loadAllItems(cwd).length, 0);
});

test('sourceRoot prefixes are normalized for evidence invalidation', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP', version:'2.5.25.56', sourceRoot:'src'});
  const draft = createDraft(cwd, {proposals:[
    {action:'add', kind:'fact', scope:'configuration', topic:'module', statement:'Module has Test', confidence:'verified', evidence:[{type:'source',path:'src/Module.bsl'}]},
  ]});
  applyDraft(cwd, draft.id);
  const fact = loadAllItems(cwd)[0];
  assert.equal(fact.provenance.evidence[0].path, 'Module.bsl');
  const invalidations = automaticInvalidations(cwd, ['Module.bsl'], {candidateVersion:'2.5.25.56'});
  assert.equal(invalidations.length, 1);
});

test('configuration knowledge is version-bound while project policy is not by default', () => {
  const cfg = {name:'ERP', version:'2.5.25.56', fingerprint:'abc', sourceRoot:'src'};
  const fact = normalizeProposal({kind:'fact',scope:'configuration',topic:'x',statement:'x',confidence:'high'}, {configuration:cfg}).item;
  const project = normalizeProposal({kind:'rule',scope:'project',topic:'x',statement:'x',confidence:'high'}, {configuration:cfg}).item;
  assert.equal(fact.appliesTo.versionRange, '2.5.25.56');
  assert.equal(project.appliesTo.versionRange, undefined);
  assert.equal(project.fingerprintAtVerification, undefined);
  assert.equal(versionMatches('2.5.x', '2.5.26'), true);
  assert.equal(versionMatches('2.5.*', '2.5.25'), true);
  assert.equal(versionMatches('2.5.25.56', '2.5.25.57'), false);
});

test('version update proposes invalidation for exact-bound configuration item but not project rule', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP', version:'2.5.25.56', sourceRoot:'src'});
  const draft = createDraft(cwd, {proposals:[
    {action:'add', kind:'fact', scope:'configuration', topic:'module', statement:'Module fact', confidence:'verified', evidence:[{type:'source',path:'Other.bsl'}]},
    {action:'add', kind:'rule', scope:'project', topic:'policy', statement:'Use project extension', confidence:'verified', evidence:[{type:'user',note:'policy'}]},
  ]});
  applyDraft(cwd, draft.id);
  const invalidations = automaticInvalidations(cwd, [], {candidateVersion:'2.5.25.57'});
  assert.equal(invalidations.length, 1);
  assert.equal(invalidations[0].scope, 'configuration');
  assert.match(invalidations[0].reason, /version binding/i);
});

test('supersedes preserves history instead of deleting old knowledge', () => {
  const cwd = tempProject();
  initConfiguration(cwd, {name:'ERP', version:'2.5', sourceRoot:'src'});
  const d1 = createDraft(cwd, {proposals:[{action:'add', id:'configuration.rule.old', kind:'rule', scope:'configuration', topic:'policy', statement:'Old policy', confidence:'high'}]});
  applyDraft(cwd, d1.id);
  const d2 = createDraft(cwd, {proposals:[{action:'add', id:'configuration.rule.new', kind:'rule', scope:'configuration', topic:'policy', statement:'New policy', confidence:'high', supersedes:['configuration.rule.old']}]});
  applyDraft(cwd, d2.id);
  assert.equal(findItem(cwd, 'configuration.rule.old').status, 'superseded');
  assert.equal(findItem(cwd, 'configuration.rule.new').status, 'active');
});
