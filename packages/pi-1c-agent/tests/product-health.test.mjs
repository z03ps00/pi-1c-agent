import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapWritesOptionalMcp,
  findMachineLocalPathHits,
  findUnsolicitedMcpServers,
  inspectMcpJsonFile,
  listPackageShippedFiles,
  scanMachineLocalPaths,
} from '../lib/product-health.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('machine-local scanner catches DevopsMoments and other absolute roots', () => {
  const stain = 'Devops' + 'Moments';
  assert.ok(findMachineLocalPathHits(`C:/${stain}/pi-agents`).includes(stain));
  assert.ok(findMachineLocalPathHits('See /home/pavel/.pi/packages/x').includes('absolute-linux-home'));
  assert.ok(findMachineLocalPathHits('required: /mnt/vol_328/work').includes('volume-mount'));
  assert.deepEqual(findMachineLocalPathHits('Use $PI_CODING_AGENT_DIR and relative prompts/'), []);
});

test('unsolicited MCP detector flags memory/knowledge and 1C bundle ports', () => {
  assert.deepEqual(findUnsolicitedMcpServers({ mcpServers: {} }), []);
  assert.ok(findUnsolicitedMcpServers({ mcpServers: { memory: { url: 'http://127.0.0.1:8000' } } }).includes('memory'));
  assert.ok(findUnsolicitedMcpServers({ mcpServers: { syntax: { url: 'http://127.0.0.1:8002' } } }).some((x) => x.includes('1c-bundle-port')));
});

test('shipped package files have no machine-local path leftovers', () => {
  const hits = scanMachineLocalPaths(listPackageShippedFiles(root));
  assert.deepEqual(hits, []);
});

test('bootstrap source does not write mcpServers into mcp.json', () => {
  const src = fs.readFileSync(path.join(root, 'tools', 'bootstrap.mjs'), 'utf8');
  assert.equal(bootstrapWritesOptionalMcp(src), false);
});

test('inspectMcpJsonFile reports missing file as clean', () => {
  const missing = inspectMcpJsonFile(path.join(os.tmpdir(), 'pi1c-no-mcp.json'));
  assert.equal(missing.exists, false);
  assert.deepEqual(missing.issues, []);
});
