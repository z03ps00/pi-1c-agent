import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectMcpJson } from '../lib/mcp-inspect.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('fresh clone leaves optional MCP unconfigured and does not require startup connect failure', () => {
  const root = profileRoot();
  const mcp = JSON.parse(fs.readFileSync(path.join(root, 'mcp.json'), 'utf8'));
  assert.deepEqual(inspectMcpJson(mcp).unsolicited, []);
  assert.deepEqual(mcp.mcpServers, {});
  assert.equal(mcp.settings?.notifyOnStartupConnect, false);
  const overlay = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(overlay, /memory MCP not in use/);
  assert.match(overlay, /Do not retry the missing server in a loop/);
  assert.doesNotMatch(overlay, /must fail (?:the )?startup if MCP is not connected/i);
});
