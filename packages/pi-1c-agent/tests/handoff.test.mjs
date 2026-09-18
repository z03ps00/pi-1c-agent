import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUpstreamHandoff, validateHandoff } from '../lib/handoff.mjs';

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
