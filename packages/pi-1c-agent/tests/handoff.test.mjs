import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffFailureMessage, handoffInstruction, parseUpstreamHandoff, validateHandoff } from '../lib/handoff.mjs';

const valid = `Result\n\n## Upstream Handoff\n\n\`\`\`json\n{\n  "schema": 2,\n  "runId": "run-x",\n  "agent": "1c-explorer",\n  "status": "ok",\n  "task": "x",\n  "artifacts": [],\n  "findings": ["ok"],\n  "public_surface": [],\n  "locked_decisions": [],\n  "constraints": [],\n  "unresolved": [],\n  "verification": []\n}\n\`\`\``;

test('valid handoff parses and preserves exact heading', () => {
  const r = parseUpstreamHandoff(valid);
  assert.equal(r.ok, true);
  assert.ok(r.section.startsWith('## Upstream Handoff'));
  assert.equal(r.handoff.task, 'x');
  assert.equal(r.handoff.schema, 2);
});

test('malformed handoff is rejected', () => {
  const r = parseUpstreamHandoff('## Upstream Handoff\n```json\n{"task":"x"}\n```');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.includes('schema') || x.includes('artifacts') || x.includes('runId')));
});

test('missing schema version is rejected', () => {
  const r = validateHandoff({
    task: 'x', runId: 'r', agent: '1c-explorer', status: 'ok',
    artifacts: [], findings: [], public_surface: [], locked_decisions: [],
    constraints: [], unresolved: [], verification: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => /schema must equal 2/.test(x)));
});

test('missing runId or status is rejected', () => {
  const base = {
    schema: 2, agent: '1c-explorer', task: 'x',
    artifacts: [], findings: [], public_surface: [], locked_decisions: [],
    constraints: [], unresolved: [], verification: [],
  };
  assert.equal(validateHandoff({ ...base, runId: 'r' }).ok, false);
  assert.equal(validateHandoff({ ...base, status: 'ok' }).ok, false);
});

test('handoff-like labels in the body do not steal the last valid envelope', () => {
  const output = `Mention ## Upstream Handoff in prose.\n\n## Upstream Handoff\n\n\`\`\`json\n{"schema":2,"runId":"1","agent":"1c-explorer","status":"ok","task":"first","artifacts":[],"findings":[],"public_surface":[],"locked_decisions":[],"constraints":[],"unresolved":[],"verification":[]}\n\`\`\`\n\n## Handoff v2\n\n\`\`\`json\n{"schema":2,"runId":"2","agent":"1c-explorer","status":"ok","task":"second","artifacts":[],"findings":[],"public_surface":[],"locked_decisions":[],"constraints":[],"unresolved":[],"verification":[{"kind":"syntaxcheck","status":"passed","summary":"ok"}]}\n\`\`\``;
  const r = parseUpstreamHandoff(output);
  assert.equal(r.ok, true);
  assert.equal(r.handoff.task, 'second');
});

const schema2 = {
  schema: 2, runId: 'r', agent: '1c-explorer', status: 'ok', task: 'x',
  artifacts: [], findings: [], locked_decisions: [], constraints: [], unresolved: [], verification: [],
};

test('schema-2 JSON fence is recovered without the heading', () => {
  const r = parseUpstreamHandoff(`# Findings\n\nlooked around\n\n\`\`\`json\n${JSON.stringify(schema2)}\n\`\`\``);
  assert.equal(r.ok, true);
  assert.equal(r.handoff.agent, '1c-explorer');
  assert.ok(r.section.startsWith('## Upstream Handoff'));
});

test('heading variants and schema string 2 are accepted', () => {
  const body = { ...schema2, schema: '2', task: 'variant' };
  const r = parseUpstreamHandoff(`### upstream handoff\n\n\`\`\`JSON\n${JSON.stringify(body)}\n\`\`\``);
  assert.equal(r.ok, true);
  assert.equal(r.handoff.schema, 2);
  assert.equal(r.handoff.task, 'variant');
});

test('unlabeled v1 envelope is still rejected', () => {
  const v1 = { task: 'x', artifacts: [], findings: [], locked_decisions: [], constraints: [], unresolved: [], verification: [] };
  const r = parseUpstreamHandoff(`## Upstream Handoff\n\n\`\`\`json\n${JSON.stringify(v1)}\n\`\`\``);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => /schema must equal 2/.test(x)));
});

test('empty output still reports a missing heading', () => {
  const r = parseUpstreamHandoff('');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.includes('## Upstream Handoff')));
});

test('handoff instruction names the child agent', () => {
  const text = handoffInstruction('1c-explorer');
  assert.match(text, /"agent": "1c-explorer"/);
  assert.match(text, /## Upstream Handoff/);
});

test('handoff failure includes the child output tail', () => {
  const msg = handoffFailureMessage('1c-explorer', { errors: ["missing '## Upstream Handoff' section"] }, '# Findings\nlooked around');
  assert.match(msg, /1c-explorer returned invalid handoff/);
  assert.match(msg, /looked around/);
});

test('handoff failure surfaces empty assistant text, stderr and event types', () => {
  const msg = handoffFailureMessage('1c-explorer', { errors: ["missing '## Upstream Handoff' section"] }, '', {
    stderr: 'Request error',
    stdoutBytes: 120,
    stderrBytes: 13,
    eventTypes: ['session', 'agent_start', 'message_end'],
    lastStopReason: 'error',
    lastErrorMessage: 'fetch failed',
  });
  assert.match(msg, /Child assistant text was empty/);
  assert.match(msg, /Request error/);
  assert.match(msg, /stopReason: error/);
  assert.match(msg, /fetch failed/);
  assert.match(msg, /agent_start/);
});
