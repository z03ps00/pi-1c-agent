import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package registers stabilized extensions', () => {
  assert.equal(pkg.version, '0.6.1');
  for (const p of ['extensions/1c-mode/index.ts','extensions/1c-subagents/index.ts','extensions/1c-admin/index.ts','extensions/1c-knowledge/index.ts','extensions/1c-init/index.ts','extensions/1c-session-rotate/index.ts','extensions/1c-memory/index.ts']) {
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
  assert.match(initExt, /tokens\.includes\("knowledge"\)/);
  assert.match(initExt, /\/init knowledge/);
  const knowledgeStart = initExt.indexOf('if (requested.knowledge)');
  assert.ok(knowledgeStart >= 0);
  const knowledgeEnd = initExt.indexOf('let sourceChoice', knowledgeStart);
  const knowledgeBlock = initExt.slice(knowledgeStart, knowledgeEnd);
  assert.match(knowledgeBlock, /ensureProjectKnowledgeLayout/);
  assert.doesNotMatch(knowledgeBlock, /runBootstrap/);
  assert.doesNotMatch(knowledgeBlock, /applyProjectInitialization/);
  assert.match(knowledgeBlock, /Не копирует агента/);
});

test('1c-memory registers flush/wrap/capture-model without 1c- aliases', () => {
  const src = fs.readFileSync(path.join(root, 'extensions', '1c-memory', 'index.ts'), 'utf8');
  assert.match(src, /registerCommand\("memory-flush"/);
  assert.match(src, /registerCommand\("wrap"/);
  assert.match(src, /registerCommand\("capture-model"/);
  assert.doesNotMatch(src, /registerCommand\("1c-memory-flush"/);
  assert.doesNotMatch(src, /registerCommand\("1c-wrap"/);
  assert.match(src, /agent_settled/);
  assert.doesNotMatch(src, /pi\.sendUserMessage|sendUserMessage\(/);
  assert.doesNotMatch(src, /import\s*\{[^}]*flattenSessionEntries/);
  assert.doesNotMatch(src, /import\s*\{[^}]*distillWithProvider/);
  assert.doesNotMatch(src, /import\s*\{[^}]*formatWrapNotify/);
  assert.match(src, /distillWithProvider/);
  assert.match(src, /formatWrapNotify/);
  assert.match(src, /getContextUsage/);
  assert.match(src, /typeof fn !== "function"/);
});

test('session-rotate command and compaction hooks are registered', () => {
  const src = fs.readFileSync(path.join(root, 'extensions', '1c-session-rotate', 'index.ts'), 'utf8');
  assert.match(src, /registerCommand\("session-rotate"/);
  assert.doesNotMatch(src, /registerCommand\("1c-session-rotate"/);
  assert.match(src, /session_before_compact/);
  assert.match(src, /agent_settled/);
  assert.match(src, /"tool_call"/);
  assert.match(src, /terminate: true/);
  assert.doesNotMatch(src, /import\s*\{[^}]*shouldArmMidTurnRotation/);
  assert.match(src, /typeof fn !== "function"/);
  assert.match(src, /newSession/);
  assert.match(src, /parentSession/);
  assert.match(src, /sendUserMessage/);
  assert.match(src, /STATE_CUSTOM_TYPE/);
});

test('knowledge commands pick pending drafts without /1c- names', () => {
  const src = fs.readFileSync(path.join(root, 'extensions', '1c-knowledge', 'index.ts'), 'utf8');
  assert.match(src, /registerCommand\("learn"/);
  assert.match(src, /ctx\.ui\.select\("Learn"/);
  assert.match(src, /"new fact\/rule"/);
  assert.match(src, /"approve a draft"/);
  assert.match(src, /"reject a draft"/);
  assert.match(src, /ctx\.ui\.input/);
  assert.match(src, /function pendingDrafts/);
  assert.doesNotMatch(src, /listDrafts/);
  assert.doesNotMatch(src, /registerCommand\("1c-learn"/);
  assert.doesNotMatch(src, /\/1c-learn|\/1c-config/);
});

test('1c-mode docker hard-block is flag or socket detect, not unconditional', () => {
  const mode = fs.readFileSync(path.join(root, 'extensions', '1c-mode', 'index.ts'), 'utf8');
  assert.match(mode, /from "\.\.\/\.\.\/lib\/docker-policy\.mjs"/);
  assert.doesNotMatch(mode, /AWG, а docker-контейнеры/);
});

test('1c-mode scopes session approvals and 1c-subagents restrict child env', () => {
  const mode = fs.readFileSync(path.join(root, 'extensions', '1c-mode', 'index.ts'), 'utf8');
  assert.match(mode, /approvalScope/);
  assert.match(mode, /Approve this risk class for this target \(session\)/);
  assert.doesNotMatch(mode, /Approve all like this/);
  const agents = fs.readFileSync(path.join(root, 'extensions', '1c-subagents', 'index.ts'), 'utf8');
  assert.match(agents, /childProcessEnv/);
  assert.match(agents, /terminateProcessTree/);
  assert.doesNotMatch(agents, /\.\.\.process\.env/);
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
