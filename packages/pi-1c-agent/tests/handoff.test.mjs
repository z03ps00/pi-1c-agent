import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUpstreamHandoff } from '../lib/handoff.mjs';

const valid = `Result\n\n## Upstream Handoff\n\n\`\`\`json\n{\n  "task":"x",\n  "artifacts":[],\n  "findings":["ok"],\n  "public_surface":[],\n  "locked_decisions":[],\n  "constraints":[],\n  "unresolved":[],\n  "verification":[]\n}\n\`\`\``;

test('valid handoff parses and preserves exact heading', () => {
  const r = parseUpstreamHandoff(valid);
  assert.equal(r.ok, true);
  assert.ok(r.section.startsWith('## Upstream Handoff'));
  assert.equal(r.handoff.task, 'x');
});

test('malformed handoff is rejected', () => {
  const r = parseUpstreamHandoff('## Upstream Handoff\n```json\n{"task":"x"}\n```');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.includes('artifacts')));
});
