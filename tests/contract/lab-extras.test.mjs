import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';

const LAB_EXTRAS = ['vanessa-mcp', 'kd2-rules', 'kd31-rules', '1c-mcp-toolkit', 'humanizer-ru'];

test('lab extras are present as skills and isolated from ai_rules_1c', () => {
  const root = profileRoot();
  for (const name of LAB_EXTRAS) {
    const skillPath = path.join(root, 'skills', name, 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), `${skillPath} missing`);
  }
  const register = fs.readFileSync(path.join(root, 'UPSTREAM-REGISTER.md'), 'utf8');
  for (const name of LAB_EXTRAS) {
    assert.ok(
      !register.includes(name),
      `UPSTREAM-REGISTER.md must not list lab extra ${name} as ai_rules_1c`,
    );
  }
});
