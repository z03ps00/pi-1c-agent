import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  PIPELINE_WRITER_AGENTS,
  hasJsonHandoffBlock,
  markdownOnlyHandoffRequired,
} from '../lib/agents.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('pipeline writer agents require JSON ## Upstream Handoff', () => {
  const agentsDir = path.join(profileRoot(), 'agents');
  for (const name of PIPELINE_WRITER_AGENTS) {
    const filePath = path.join(agentsDir, `${name}.md`);
    assert.ok(fs.existsSync(filePath), `${filePath} missing`);
    const md = fs.readFileSync(filePath, 'utf8');
    assert.ok(
      hasJsonHandoffBlock(md),
      `${filePath} must require JSON ## Upstream Handoff with the contract keys`,
    );
    assert.equal(
      markdownOnlyHandoffRequired(md),
      false,
      `${filePath} must not require markdown-only handoff`,
    );
  }
});

test('no agent requires markdown-only Handoff for the next subagent', () => {
  const agentsDir = path.join(profileRoot(), 'agents');
  for (const name of fs.readdirSync(agentsDir).filter((n) => n.endsWith('.md'))) {
    const filePath = path.join(agentsDir, name);
    const md = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      markdownOnlyHandoffRequired(md),
      false,
      `${filePath} treats markdown-only handoff as required`,
    );
  }
});
