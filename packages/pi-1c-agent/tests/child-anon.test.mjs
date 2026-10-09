import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childAnonLaunch, readParentAnonLevel } from '../lib/child-anon.mjs';
import { childProcessEnv } from '../lib/child-env.mjs';

test('child launch carries the live anonymity level and overrides a stale env', () => {
  const launch = childAnonLaunch(2);
  assert.deepEqual(launch.args, ['--anon', '2']);
  const env = childProcessEnv({ PATH: '/bin', PI_1C_ANON: '0' }, launch.env);
  assert.equal(env.PI_1C_ANON, '2');
  globalThis.__PI_1C_ANON__ = 3;
  assert.equal(readParentAnonLevel(), 3);
  delete globalThis.__PI_1C_ANON__;
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensions', '1c-subagents', 'index.ts'), 'utf8');
  assert.match(src, /childAnonLaunch\(readParentAnonLevel\(\)\)/);
  assert.match(src, /\.\.\.anonLaunch\.args/);
});
