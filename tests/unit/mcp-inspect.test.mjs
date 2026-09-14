import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectMcpJson, optionalFragmentsOnly } from '../lib/mcp-inspect.mjs';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mcp');

test('inspectMcpJson: compliant empty mcpServers', () => {
  const obj = JSON.parse(fs.readFileSync(path.join(fixtures, 'good.json'), 'utf8'));
  const result = inspectMcpJson(obj);
  assert.deepEqual(result.unsolicited, []);
  assert.equal(result.optionalOnly, true);
});

test('inspectMcpJson: violating memory and 8002 bundle port', () => {
  const obj = JSON.parse(fs.readFileSync(path.join(fixtures, 'bad.json'), 'utf8'));
  const result = inspectMcpJson(obj);
  assert.ok(result.unsolicited.includes('memory'), result.unsolicited);
  assert.ok(result.unsolicited.some((x) => x.includes('1c-bundle-port')), result.unsolicited);
  assert.equal(result.optionalOnly, false);
});

test('optionalFragmentsOnly: good fragments + empty default', () => {
  assert.equal(
    optionalFragmentsOnly({
      fragmentNames: ['memory.json', 'knowledge.json', '1c-bundle.json', 'vanessa.json'],
      defaultMcp: { mcpServers: {} },
    }),
    true,
  );
});

test('optionalFragmentsOnly: missing vanessa fragment or vanessa in default', () => {
  assert.equal(
    optionalFragmentsOnly({
      fragmentNames: ['memory.json', 'knowledge.json', '1c-bundle.json'],
      defaultMcp: { mcpServers: {} },
    }),
    false,
  );
  assert.equal(
    optionalFragmentsOnly({
      fragmentNames: ['memory.json', 'knowledge.json', '1c-bundle.json', 'vanessa.json'],
      defaultMcp: { mcpServers: { vanessaAutomation: { url: 'http://127.0.0.1:1' } } },
    }),
    false,
  );
});
