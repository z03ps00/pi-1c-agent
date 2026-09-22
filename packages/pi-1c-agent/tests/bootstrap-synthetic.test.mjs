import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devEnvSchema = JSON.parse(fs.readFileSync(path.join(root, 'config', 'dev-env.schema.json'), 'utf8'));
const roles = ['analytic','arch-reviewer','architect','code-reviewer','developer','doc-writer','error-fixer','explorer','metadata-manager','performance-optimizer','planner','refactoring','tester'];

test('bootstrap adapts all synthetic categories and preserves MCP capability', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-bootstrap-'));
  const source = path.join(tmp, 'upstream');
  const project = path.join(tmp, 'project');
  for (const d of ['content/agents','content/rules','content/standards','content/skills/sample','content/commands','openspec','content/openspec-bundle']) fs.mkdirSync(path.join(source, d), {recursive:true});
  fs.mkdirSync(project, {recursive:true});
  fs.writeFileSync(path.join(source, 'AGENTS.md'), '# upstream\nSee content/rules/test.md\n');
  fs.writeFileSync(path.join(source, 'LLM-RULES.md'), '# llm\n');
  fs.writeFileSync(path.join(source, 'USER-RULES.md'), '# user\n');
  fs.writeFileSync(path.join(source, 'memory.md'), '# memory\n');
  fs.writeFileSync(path.join(source, '.dev.env.example'), devEnvSchema.variables.map((v) => `${v.name}=${['COMMENT_OPEN','COMMENT_CLOSE'].includes(v.name) ? v.default ?? '' : ['NEW_OBJECTS_IN','INFOBASE_KIND','USE_EDT'].includes(v.name) ? v.default ?? '' : ''}`).join('\n') + '\n');
  fs.writeFileSync(path.join(source, 'content/rules/test.md'), '---\ndescription: test\nglobs: "**"\ncategory: x\n---\nSee content/skills/sample/SKILL.md\n');
  fs.writeFileSync(path.join(source, 'content/standards/s.md'), '# standard\n');
  fs.writeFileSync(path.join(source, 'content/skills/sample/SKILL.md'), '---\nname: sample\n---\nSee content/rules/test.md\n');
  fs.writeFileSync(path.join(source, 'content/commands/c.md'), '---\ndescription: c\nargumentHint: x\nallowedTools: [Read]\n---\nDo it\n');
  fs.writeFileSync(path.join(source, 'openspec/README.md'), '# os\n');
  fs.writeFileSync(path.join(source, 'content/openspec-bundle/README.md'), '# bundle\n');
  for (const role of roles) {
    fs.writeFileSync(path.join(source, `content/agents/${role}.md`), `---\nname: 1c-${role}\ndescription: ${role}\nmodelTier: coding\ntools: ["Read", "Write", "MCP"]\nisSubagent: true\nallowParallel: true\n---\nAgent ${role}\n`);
  }
  const r = spawnSync(process.execPath, [path.join(root, 'tools/bootstrap.mjs'), '--project', '--source', source, '--allow-unpinned-source'], {cwd:project, encoding:'utf8'});
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const agentFiles = fs.readdirSync(path.join(project, '.pi', 'agents')).filter((x)=>x.startsWith('1c-')&&x.endsWith('.md'));
  assert.equal(agentFiles.length, 13);
  const developer = fs.readFileSync(path.join(project, '.pi', 'agents', '1c-developer.md'), 'utf8');
  assert.match(developer, /^capabilities:\s*mcp/m);
  assert.doesNotMatch(developer, /^isSubagent:/m);
  const rule = fs.readFileSync(path.join(project, '.pi', 'rules-1c', 'rules', 'test.md'), 'utf8');
  assert.doesNotMatch(rule, /^globs:/m);
  assert.doesNotMatch(rule, /^category:/m);
  assert.doesNotMatch(rule, /content\/skills\//);
  const prompt = fs.readFileSync(path.join(project, '.pi', 'prompts', '1c-c.md'), 'utf8');
  assert.doesNotMatch(prompt, /^argumentHint:/m);
  assert.doesNotMatch(prompt, /^allowedTools:/m);
  assert.equal(fs.existsSync(path.join(project, 'mcp.json')), false);
  assert.equal(fs.existsSync(path.join(project, '.pi', 'mcp.json')), false);
  const settings = JSON.parse(fs.readFileSync(path.join(project, '.pi', '1c', 'settings.json'), 'utf8'));
  assert.equal(settings.projectAgents, true);
  const mapping = JSON.parse(fs.readFileSync(path.join(project, '.pi', '1c', 'UPSTREAM-MAPPING.json'), 'utf8'));
  assert.ok(mapping.length > 13);

  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin, {recursive:true});
  fs.writeFileSync(path.join(bin, 'pi'), '#!/bin/sh\necho 0.85.1\n');
  fs.chmodSync(path.join(bin, 'pi'), 0o755);
  fs.writeFileSync(path.join(bin, 'pi.cmd'), '@echo off\r\necho 0.85.1\r\n');
  const doctor = spawnSync(process.execPath, [path.join(root, 'tools/doctor.mjs'), '--project'], {
    cwd: project,
    encoding: 'utf8',
    env: {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`},
  });
  assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
  assert.match(doctor.stdout, /CORE: PASS/);
});
