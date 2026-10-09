import test from 'node:test';
import assert from 'node:assert/strict';
import { isStructuralCall } from '../lib/harness/capabilities.mjs';

test('a nested search method counts as structural and a random method does not', () => {
  assert.equal(isStructuralCall('mcp', { tool: 'codesearch' }), true);
  assert.equal(isStructuralCall('mcp', { tool: 'plugin_reload' }), false);
  assert.equal(isStructuralCall('grep', { pattern: 'codesearch' }), false);
});
