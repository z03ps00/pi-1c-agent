import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { combineParallelHandoffs, loadWorkflows, parseWorkflowYaml, validateWorkflow, verifyWorkflowHandoff } from '../lib/workflows.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('runtime loads all declared workflow YAML files as source of truth', () => {
  const workflows = loadWorkflows(packageRoot);
  assert.deepEqual([...workflows.keys()].sort(), ['architecture','bugfix','feature','performance','refactor']);
  const feature = workflows.get('feature');
  assert.equal(feature.stages.at(-1).type, 'verification');
  const architecture = workflows.get('architecture');
  assert.equal(architecture.stages[0].type, 'parallel');
  assert.deepEqual(architecture.stages[0].agents, ['1c-explorer','1c-analytic']);
});

test('workflow parser rejects parallel stages with more than one writer', () => {
  assert.throws(() => parseWorkflowYaml('name: bad\nstages:\n  - parallel: [1c-developer, 1c-tester]\n'), /more than one writer/i);
  assert.doesNotThrow(() => parseWorkflowYaml('name: ok\nstages:\n  - parallel: [1c-explorer, 1c-analytic]\n'));
});

test('workflow validation rejects unsupported agent names', () => {
  const result = validateWorkflow({name:'x', stages:[{type:'agent', agent:'developer'}]});
  assert.equal(result.ok, false);
});

test('workflow validation rejects verification as the first stage', () => {
  const result = validateWorkflow({name:'x', stages:[{type:'verification'}]});
  assert.equal(result.ok, false);
});

test('parallel handoffs preserve each exact upstream section', () => {
  const a = '## Upstream Handoff\n```json\n{"task":"a"}\n```';
  const b = '## Upstream Handoff\n```json\n{"task":"b"}\n```';
  const combined = combineParallelHandoffs([{agent:'1c-explorer',upstreamHandoff:a},{agent:'1c-analytic',upstreamHandoff:b}]);
  assert.match(combined, /### 1c-explorer/);
  assert.ok(combined.includes(a));
  assert.ok(combined.includes(b));
});

test('verification gate requires explicit verification evidence', () => {
  assert.equal(verifyWorkflowHandoff({handoff:{verification:[]}}).ok, false);
  const ok = verifyWorkflowHandoff({handoff:{verification:['syntaxcheck PASS']}});
  assert.equal(ok.ok, true);
});
