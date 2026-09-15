import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package registers stabilized extensions', () => {
  assert.equal(pkg.version, '0.6.1');
  for (const p of ['extensions/1c-mode/index.ts','extensions/1c-subagents/index.ts','extensions/1c-admin/index.ts','extensions/1c-knowledge/index.ts','extensions/1c-init/index.ts','extensions/1c-session-rotate/index.ts']) {
    assert.ok(pkg.pi.extensions.includes(p));
    assert.ok(fs.existsSync(path.join(root, p)));
  }
});

test('doctor is a command, not a prompt template collision', () => {
  assert.equal(fs.existsSync(path.join(root, 'prompts', 'doctor.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'prompts', '1c-doctor.md')), false);
  const admin = fs.readFileSync(path.join(root, 'extensions', '1c-admin', 'index.ts'), 'utf8');
  assert.match(admin, /registerCommand\("doctor"/);
  assert.doesNotMatch(admin, /registerCommand\("1c-doctor"/);
});


test('project init UX schema is explicit and complete', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'config', 'dev-env.schema.json'), 'utf8'));
  assert.equal(schema.variables.length, 43);
  assert.equal(new Set(schema.variables.map((x) => x.name)).size, 43);
  const initExt = fs.readFileSync(path.join(root, 'extensions', '1c-init', 'index.ts'), 'utf8');
  assert.match(initExt, /registerCommand\("init"/);
  assert.doesNotMatch(initExt, /registerCommand\("1c-init"/);
  assert.match(initExt, /Источник проекта \(первый вопрос \/init\)/);
  assert.match(initExt, /Пустая структура исходников/);
  assert.match(initExt, /Выгрузка из существующей ИБ \/ \.cf \/ \.dt/);
  assert.match(initExt, /Подробный/);
  assert.match(initExt, /collectSiblingSharedEnv/);
  assert.match(initExt, /Общие значения из соседних проектов/);
  assert.match(initExt, /Принять все предложенные/);
  assert.match(initExt, /build\/\{cf,cfe,epf,erf\}/);
  assert.match(initExt, /docs\/techtask/);
});

test('session-rotate command and compaction hooks are registered', () => {
  const src = fs.readFileSync(path.join(root, 'extensions', '1c-session-rotate', 'index.ts'), 'utf8');
  assert.match(src, /registerCommand\("session-rotate"/);
  assert.doesNotMatch(src, /registerCommand\("1c-session-rotate"/);
  assert.match(src, /session_before_compact/);
  assert.match(src, /agent_settled/);
  assert.match(src, /newSession/);
  assert.match(src, /parentSession/);
  assert.match(src, /sendUserMessage/);
  assert.match(src, /STATE_CUSTOM_TYPE/);
});

test('1c-mode docker hard-block is flag or socket detect, not unconditional', () => {
  const mode = fs.readFileSync(path.join(root, 'extensions', '1c-mode', 'index.ts'), 'utf8');
  assert.match(mode, /from "\.\.\/\.\.\/lib\/docker-policy\.mjs"/);
  assert.doesNotMatch(mode, /AWG, а docker-контейнеры/);
});

test('1c-mode registers ASK, ANON, and the three-way hotkey cycle', () => {
  const mode = fs.readFileSync(path.join(root, 'extensions', '1c-mode', 'index.ts'), 'utf8');
  assert.match(mode, /registerCommand\("mode"/);
  assert.doesNotMatch(mode, /registerCommand\("1c-ask"/);
  assert.doesNotMatch(mode, /registerCommand\("1c-plan"/);
  assert.doesNotMatch(mode, /registerCommand\("1c-build"/);
  assert.doesNotMatch(mode, /registerCommand\("1c-execute-plan"/);
  assert.match(mode, /registerCommand\("anon"/);
  assert.match(mode, /registerFlag\("anon"/);
  assert.match(mode, /registerCommand\("approve"/);
  assert.match(mode, /registerFlag\("approve"/);
  assert.match(mode, /Key\.ctrlAlt\("a"\)/);
  assert.match(mode, /Key\.ctrlAlt\("p"\)/);
  assert.match(mode, /Key\.ctrlAlt\("s"\)/);
  assert.match(mode, /Unknown 1C mode: \$\{requested\}\. Use plan, build, or ask/);
  assert.match(mode, /\[1C MODE CHANGE\]/);
  assert.match(mode, /Memory: skipped — anonymous/);
});
