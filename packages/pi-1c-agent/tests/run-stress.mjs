#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, ['--test', path.join(dir, 'multiagent-stress.test.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, PI_1C_STRESS: '1' },
});
process.exit(r.status ?? 1);
