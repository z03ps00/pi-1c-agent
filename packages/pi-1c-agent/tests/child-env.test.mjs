import test from 'node:test';
import assert from 'node:assert/strict';
import { childProcessEnv, isAllowedChildEnvKey } from '../lib/child-env.mjs';

test('child env allowlists runtime and provider keys only', () => {
  const env = childProcessEnv({
    PATH: '/bin',
    HOME: '/home/dev',
    OPENAI_API_KEY: 'sk-test',
    PI_1C_MAX_SUBAGENTS: '4',
    AWS_SECRET_ACCESS_KEY: 'should-not-pass',
    DATABASE_URL: 'postgres://u:p@localhost/db',
    GITHUB_TOKEN: 'gho_secret',
    CI: 'true',
  }, {
    PI_1C_CHILD_PROCESS: '1',
  });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.OPENAI_API_KEY, 'sk-test');
  assert.equal(env.PI_1C_MAX_SUBAGENTS, '4');
  assert.equal(env.PI_1C_CHILD_PROCESS, '1');
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.CI, undefined);
  assert.equal(isAllowedChildEnvKey('AWS_SECRET_ACCESS_KEY'), false);
  assert.equal(isAllowedChildEnvKey('PI_CODING_AGENT_DIR'), true);
});
