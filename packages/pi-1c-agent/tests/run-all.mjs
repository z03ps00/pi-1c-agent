#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = [
  'plan-state.test.mjs','plan-policy.test.mjs','modes-anon.test.mjs','handoff.test.mjs','agent-policy.test.mjs','workflows.test.mjs','knowledge.test.mjs','project-init.test.mjs','package-contract.test.mjs','docker-policy.test.mjs','product-health.test.mjs','bootstrap-synthetic.test.mjs','session-rotate.test.mjs','approve-policy.test.mjs','memory-integrity.test.mjs','memory-reconcile.test.mjs','session-capture.test.mjs','mode-state.test.mjs','child-transport.test.mjs','memory-mcp.test.mjs','subagent-budget.test.mjs','node-runtime.test.mjs','multiagent-integration.test.mjs',
].map((f)=>path.join(dir,f));
const r = spawnSync(process.execPath, ['--test', ...files], {stdio:'inherit'});
process.exit(r.status ?? 1);
