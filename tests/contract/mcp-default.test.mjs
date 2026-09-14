import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectMcpJson, optionalFragmentsOnly } from '../lib/mcp-inspect.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('default mcp.json has no unsolicited memory/knowledge/1C-bundle/Vanessa', () => {
  const root = profileRoot();
  const mcpPath = path.join(root, 'mcp.json');
  const obj = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  const result = inspectMcpJson(obj);
  assert.deepEqual(
    result.unsolicited,
    [],
    `default mcp.json (${mcpPath}) has unsolicited servers: ${result.unsolicited.join(', ')}`,
  );
  assert.equal(obj.settings?.notifyOnStartupConnect, false);
});

test('Vanessa and other optional families live only in mcp.optional/', () => {
  const root = profileRoot();
  const optionalDir = path.join(root, 'mcp.optional');
  const fragmentNames = fs
    .readdirSync(optionalDir)
    .filter((n) => n.endsWith('.json'));
  const defaultMcp = JSON.parse(fs.readFileSync(path.join(root, 'mcp.json'), 'utf8'));
  assert.ok(
    optionalFragmentsOnly({ fragmentNames, defaultMcp }),
    `mcp.optional fragments=${fragmentNames.join(', ')} must include memory/knowledge/1c-bundle/vanessa and default mcp.json must stay empty of those families`,
  );
  assert.ok(fragmentNames.includes('vanessa.json'), 'mcp.optional/vanessa.json missing');
});
