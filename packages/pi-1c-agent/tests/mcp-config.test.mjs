import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addMcpServer,
  parseMcpConfig,
  readMcpConfig,
  removeMcpServer,
  resolveMcpConfigPath,
  serverChoices,
  serverDescription,
  writeMcpConfig,
} from '../lib/mcp-config.mjs';
import { PROJECT_MCP_TEMPLATE } from '../lib/project-init.mjs';

test('commented project template parses to an empty server map', () => {
  const parsed = parseMcpConfig(PROJECT_MCP_TEMPLATE);
  assert.deepEqual(parsed.servers, {});
  assert.equal(parsed.raw.mcpServers && typeof parsed.raw.mcpServers, 'object');
});

test('adding a server keeps settings and neighbouring servers', () => {
  const raw = {
    settings: { hostConfigDiscovery: 'off', requestTimeoutMs: 120000 },
    mcpServers: {
      memory: { url: 'http://127.0.0.1:8001/mcp', headers: { Authorization: 'Bearer keep-me' } },
    },
  };
  const next = addMcpServer(raw, 'graph', 'http://127.0.0.1:8206/mcp');
  assert.equal(next.settings.hostConfigDiscovery, 'off');
  assert.equal(next.mcpServers.memory.headers.Authorization, 'Bearer keep-me');
  assert.equal(next.mcpServers.graph.url, 'http://127.0.0.1:8206/mcp');
  assert.equal(next.mcpServers.graph.httpTransport, 'streamable-http');
  assert.equal(raw.mcpServers.graph, undefined);

  const replaced = addMcpServer(next, 'memory', 'http://127.0.0.1:8001/mcp');
  assert.equal(replaced.mcpServers.memory.headers.Authorization, 'Bearer keep-me');
  assert.equal(replaced.mcpServers.memory.url, 'http://127.0.0.1:8001/mcp');
});

test('removing a server drops only that entry', () => {
  const raw = {
    settings: { scriptMode: false },
    mcpServers: {
      a: { url: 'http://127.0.0.1:1/mcp' },
      b: { url: 'http://127.0.0.1:2/mcp' },
    },
  };
  const next = removeMcpServer(raw, 'a');
  assert.equal(next.mcpServers.a, undefined);
  assert.equal(next.mcpServers.b.url, 'http://127.0.0.1:2/mcp');
  assert.equal(next.settings.scriptMode, false);
  assert.equal(raw.mcpServers.a.url, 'http://127.0.0.1:1/mcp');
});

test('server list does not show an Authorization value', () => {
  const secret = 'Bearer super-secret-token';
  const entry = {
    url: 'http://127.0.0.1:8001/mcp',
    headers: { Authorization: secret },
  };
  const description = serverDescription(entry);
  assert.equal(description.includes(secret), false);
  assert.match(description, /Authorization задан/);
  const choices = serverChoices({ memory: entry });
  const rendered = JSON.stringify(choices);
  assert.equal(rendered.includes(secret), false);
  assert.equal(choices.at(-1).value, 'add');
});

test('local scope creates .pi/mcp.json and global scope does not invent a missing profile file', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-mcpconfig-'));
  const local = resolveMcpConfigPath('local', { cwd, env: {} });
  assert.equal(local.missing, false);
  assert.equal(local.created, true);
  assert.equal(fs.readFileSync(local.file, 'utf8'), PROJECT_MCP_TEMPLATE);

  const loaded = readMcpConfig(local.file);
  writeMcpConfig(local.file, addMcpServer(loaded.raw, 'code', 'http://127.0.0.1:8200/mcp'));
  const again = resolveMcpConfigPath('local', { cwd, env: {} });
  assert.equal(again.created, false);
  const saved = readMcpConfig(again.file);
  assert.equal(saved.servers.code.url, 'http://127.0.0.1:8200/mcp');

  const missing = resolveMcpConfigPath('global', { cwd, env: { PI_CODING_AGENT_DIR: path.join(cwd, 'no-profile') } });
  assert.equal(missing.missing, true);
  assert.equal(fs.existsSync(missing.file), false);
});
