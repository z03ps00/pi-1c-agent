import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyProjectInitialization,
  autoDetectedValues,
  auditDevEnvSchema,
  collectSiblingSharedEnv,
  compiledArtifactFileName,
  compiledArtifactPath,
  configurationRootForLayout,
  detectConfiguration,
  ensureBuildScaffold,
  ensureDocsScaffold,
  ensureSourceScaffold,
  effectiveVariableMeta,
  inferSourceLayoutRoot,
  inspectSourceScaffold,
  loadDevEnvSchema,
  parseEnvTemplate,
  parseEnvValues,
  redactValue,
  renderEnvFromTemplate,
  summarizeEnv,
  ensureProjectKnowledgeLayout,
  inspectKnowledgeLayout,
} from '../lib/project-init.mjs';

const schema = loadDevEnvSchema();
const explicitDefaults = {
  COMMENT_OPEN: '// +++ {COMPANY}; {DEVELOPER}; {DATE}; {TASK}',
  COMMENT_CLOSE: '// --- {COMPANY}; {DEVELOPER}; {DATE}; {TASK}',
  NEW_OBJECTS_IN: 'main_configuration',
  INFOBASE_KIND: 'file',
  USE_EDT: 'false',
};
function template() {
  return schema.variables.map((v, i) => `# ${i + 1}. ${v.title}\n${v.name}=${explicitDefaults[v.name] ?? ''}`).join('\n\n') + '\n';
}

test('UX schema covers exactly the 43 upstream variables planned for v0.6.x', () => {
  assert.equal(schema.variables.length, 43);
  assert.equal(new Set(schema.variables.map((x) => x.name)).size, 43);
  const audit = auditDevEnvSchema(template(), schema);
  assert.equal(audit.ok, true);
  assert.equal(audit.discovered.length, 43);
});

test('schema drift is visible instead of silently losing upstream variables', () => {
  const raw = template().replace('PREFIX=', 'PREFIX=\nNEW_UPSTREAM_FLAG=') .replace('SUPPORT_API_URL=\n', '');
  const audit = auditDevEnvSchema(raw, schema);
  assert.deepEqual(audit.unknown, ['NEW_UPSTREAM_FLAG']);
  assert.deepEqual(audit.missing, ['SUPPORT_API_URL']);
  assert.equal(audit.ok, false);
});

test('template parser and renderer preserve the upstream document while changing values', () => {
  const raw = template();
  const parsed = parseEnvTemplate(raw);
  assert.equal(parsed.variables.length, 43);
  const rendered = renderEnvFromTemplate(raw, { PREFIX: 'ФСК_', INFOBASE_KIND: 'server', IB_USER: 'Developer' });
  const values = parseEnvValues(rendered);
  assert.equal(values.PREFIX, 'ФСК_');
  assert.equal(values.INFOBASE_KIND, 'server');
  assert.equal(values.IB_USER, 'Developer');
  assert.match(rendered, /# 1\. Префикс новых объектов/);
});



test('re-initialization preserves extra local env variables that are not in upstream template', () => {
  const raw = template();
  const rendered = renderEnvFromTemplate(raw, { PREFIX: 'ABC_', LOCAL_ONLY_TOKEN: 'keep-me' });
  assert.match(rendered, /LOCAL_ONLY_TOKEN=keep-me/);
  assert.match(rendered, /Local extra variables preserved/);
});

test('secret values are redacted from summaries', () => {
  assert.equal(redactValue('IB_PASSWORD', 'secret', schema), '*** настроено ***');
  assert.equal(redactValue('SUPPORT_KEY', 'token', schema), '*** настроено ***');
  const s = summarizeEnv(template(), { IB_PASSWORD: 'secret', PREFIX: 'ФСК_' }, {}, schema);
  assert.equal(s.find((x) => x.name === 'IB_PASSWORD').value, '*** настроено ***');
});

test('project initialization writes .dev.env but never leaks secret values to manifest/state', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-init-'));
  const raw = template();
  const values = Object.fromEntries(parseEnvTemplate(raw).variables.map((x) => [x.name, x.defaultValue]));
  values.PREFIX = 'ФСК_';
  values.IB_PASSWORD = 'top-secret';
  values.REPOSITORY_PASSWORD = 'repo-secret';
  values.SUPPORT_KEY = 'support-secret';
  const result = applyProjectInitialization(cwd, {
    templateRaw: raw,
    values,
    decisions: { PREFIX: { state: 'configured' }, IB_PASSWORD: { state: 'configured' } },
    projectName: 'Test',
    configurationName: 'ERP',
    configurationVersion: '2.5.25.56',
    sourceRoot: 'src',
    knowledgeEnabled: true,
    openSpecEnabled: true,
  });
  const env = fs.readFileSync(result.envPath, 'utf8');
  const yaml = fs.readFileSync(result.projectYaml, 'utf8');
  const state = fs.readFileSync(result.initState, 'utf8');
  assert.match(env, /IB_PASSWORD=top-secret/);
  for (const secret of ['top-secret', 'repo-secret', 'support-secret']) {
    assert.equal(yaml.includes(secret), false);
    assert.equal(state.includes(secret), false);
  }
  assert.match(yaml, /variableCount: 43/);
  assert.match(fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8'), /^\.dev\.env$/m);
  assert.match(fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8'), /^build\/$/m);
  if (process.platform !== 'win32') assert.equal(fs.statSync(result.envPath).mode & 0o777, 0o600);
});

test('Configuration.xml autodetection extracts source root, name, version and compatibility mode', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-detect-'));
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'Configuration.xml'), `<?xml version="1.0"?><Configuration><Properties><Name>ERP</Name><Version>2.5.25.56</Version><CompatibilityMode>Version8_3_24</CompatibilityMode></Properties></Configuration>`);
  const d = detectConfiguration(cwd);
  assert.equal(d.sourceRoot, 'src');
  assert.equal(d.name, 'ERP');
  assert.equal(d.version, '2.5.25.56');
  assert.equal(d.compatibilityMode, '8.3.24');
});

test('effective metadata follows template order and carries human descriptions', () => {
  const metas = effectiveVariableMeta(template(), schema);
  assert.equal(metas.length, 43);
  assert.equal(metas[0].name, 'PREFIX');
  assert.match(metas.find((x) => x.name === 'REPOSITORY_ALLOW_FORCE').description, /Опасная/);
});

test('source layout inference treats src/cf as configuration root and src as shared project root', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-layout-'));
  fs.mkdirSync(path.join(cwd, 'src', 'cf'), { recursive: true });
  const detected = { file: path.join(cwd, 'src', 'cf', 'Configuration.xml'), sourceRoot: 'src/cf' };
  assert.equal(inferSourceLayoutRoot(cwd, detected.sourceRoot), 'src');
  assert.equal(configurationRootForLayout(cwd, detected, 'src'), 'src/cf');
});

test('greenfield source layout defaults main configuration to src/cf', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-layout-green-'));
  assert.equal(inferSourceLayoutRoot(cwd, '.'), 'src');
  assert.equal(configurationRootForLayout(cwd, { file: null, sourceRoot: '.' }, 'src'), 'src/cf');
});

test('source scaffold creates only missing cf/cfe/epf/erf directories and preserves existing content', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-scaffold-'));
  fs.mkdirSync(path.join(cwd, 'src', 'cf'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'cf', 'Configuration.xml'), '<Configuration/>');
  const before = inspectSourceScaffold(cwd, 'src');
  assert.deepEqual(before.missing.sort(), ['src/cfe', 'src/epf', 'src/erf']);
  const result = ensureSourceScaffold(cwd, 'src');
  assert.equal(result.complete, true);
  assert.deepEqual(result.created.sort(), ['src/cfe', 'src/epf', 'src/erf']);
  assert.deepEqual(result.existing, ['src/cf']);
  assert.equal(fs.readFileSync(path.join(cwd, 'src', 'cf', 'Configuration.xml'), 'utf8'), '<Configuration/>');
});

test('source scaffold refuses to create directories outside the project root', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-scaffold-safe-'));
  assert.throws(() => inspectSourceScaffold(cwd, '../outside'), /must stay inside the project directory/);
});

test('project initialization materializes standard src scaffold and records it without touching existing files', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-init-scaffold-'));
  fs.mkdirSync(path.join(cwd, 'src', 'cf'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'cf', 'keep.txt'), 'keep');
  const raw = template();
  const values = Object.fromEntries(parseEnvTemplate(raw).variables.map((x) => [x.name, x.defaultValue]));
  const result = applyProjectInitialization(cwd, {
    templateRaw: raw,
    values,
    projectName: 'Scaffold Test',
    configurationName: 'ERP',
    configurationVersion: '2.5.25.56',
    sourceRoot: 'src/cf',
    sourceLayoutRoot: 'src',
    sourceScaffoldEnabled: true,
    knowledgeEnabled: false,
    openSpecEnabled: false,
  });
  for (const dir of ['cf', 'cfe', 'epf', 'erf']) assert.equal(fs.statSync(path.join(cwd, 'src', dir)).isDirectory(), true);
  for (const dir of ['cf', 'cfe', 'epf', 'erf']) assert.equal(fs.statSync(path.join(cwd, 'build', dir)).isDirectory(), true);
  assert.equal(fs.statSync(path.join(cwd, 'docs', 'techtask')).isDirectory(), true);
  assert.match(fs.readFileSync(path.join(cwd, 'docs', 'techtask', 'README.md'), 'utf8'), /техническ/);
  assert.equal(fs.readFileSync(path.join(cwd, 'src', 'cf', 'keep.txt'), 'utf8'), 'keep');
  assert.deepEqual(result.scaffold.created.sort(), ['src/cfe', 'src/epf', 'src/erf']);
  const yaml = fs.readFileSync(result.projectYaml, 'utf8');
  assert.match(yaml, /sourceRoot: "src\/cf"/);
  assert.match(yaml, /sourceLayout:/);
  assert.match(yaml, /root: "src"/);
  assert.match(yaml, /cfe: "src\/cfe"/);
  const state = JSON.parse(fs.readFileSync(result.initState, 'utf8'));
  assert.equal(state.sourceScaffold.complete, true);
  assert.deepEqual(state.sourceScaffold.directories, ['src/cf', 'src/cfe', 'src/epf', 'src/erf']);
  assert.equal(state.buildScaffold.complete, true);
  assert.deepEqual(state.buildScaffold.directories, ['build/cf', 'build/cfe', 'build/epf', 'build/erf']);
  assert.equal(state.docsScaffold.complete, true);
  assert.deepEqual(state.docsScaffold.directories, ['docs', 'docs/techtask']);
  assert.match(yaml, /buildLayout:/);
  assert.match(yaml, /docsLayout:/);
  assert.match(yaml, /techtask: "docs\/techtask"/);
});

test('layout-aware ENV autodetection proposes src/cf for EXPORT_PATH and src/cfe for EXTENSIONS_PATH', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-env-layout-'));
  const detected = autoDetectedValues(cwd, { sourceLayoutRoot: 'src', configurationSourceRoot: 'src/cf' });
  assert.equal(detected.EXPORT_PATH, 'src/cf');
  assert.equal(detected.EXTENSIONS_PATH, 'src/cfe');
});

test('sibling scan proposes shared PREFIX/DEVELOPER/PLATFORM and never copies secrets', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-sib-'));
  const a = path.join(parent, 'proj-a');
  const b = path.join(parent, 'proj-b');
  const current = path.join(parent, 'proj-new');
  for (const d of [a, b, current]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(a, '.dev.env'), 'PREFIX=ФСК_\nDEVELOPER=Almaz\nPLATFORM_PATH=/opt/1cv8/x86_64/8.3.27\nIB_PASSWORD=secret-a\nINFOBASE_PATH=/tmp/base-a\n');
  fs.writeFileSync(path.join(b, '.dev.env'), 'PREFIX=ФСК_\nDEVELOPER=Almaz\nPLATFORM_PATH=/opt/1cv8/x86_64/8.3.27\nIB_PASSWORD=secret-b\n');
  fs.writeFileSync(path.join(current, '.dev.env.example'), 'PREFIX=\n');
  const scan = collectSiblingSharedEnv(current);
  const byName = Object.fromEntries(scan.suggestions.map((s) => [s.name, s]));
  assert.equal(byName.PREFIX.value, 'ФСК_');
  assert.equal(byName.DEVELOPER.value, 'Almaz');
  assert.equal(byName.PLATFORM_PATH.value, '/opt/1cv8/x86_64/8.3.27');
  assert.equal(byName.IB_PASSWORD, undefined);
  assert.equal(byName.INFOBASE_PATH, undefined);
  assert.ok(scan.projects.length >= 2);
});

test('sibling scan ignores non-1C folders one level up', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-sib-empty-'));
  const current = path.join(parent, 'only');
  fs.mkdirSync(path.join(parent, 'random-notes'), { recursive: true });
  fs.mkdirSync(current);
  fs.writeFileSync(path.join(parent, 'random-notes', 'readme.txt'), 'no 1c');
  const scan = collectSiblingSharedEnv(current);
  assert.equal(scan.suggestions.length, 0);
});

test('compiled artifact names are original name plus date stamp', () => {
  const now = new Date('2026-09-14T15:04:05');
  assert.equal(compiledArtifactFileName('МоёРасширение', 'cfe', { now }), 'МоёРасширение_20260914.cfe');
  assert.equal(compiledArtifactFileName('ОтчетПродажи.erf', 'erf', { now }), 'ОтчетПродажи_20260914.erf');
  assert.equal(
    compiledArtifactFileName('Ext', 'cfe', { now, exists: (name) => name === 'Ext_20260914.cfe' }),
    'Ext_20260914-150405.cfe',
  );
});

test('build and docs scaffolds create kind folders and techtask without wiping files', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-build-docs-'));
  fs.mkdirSync(path.join(cwd, 'build', 'cfe'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'build', 'cfe', 'keep.cfe'), 'bin');
  const build = ensureBuildScaffold(cwd);
  assert.equal(build.complete, true);
  assert.equal(fs.readFileSync(path.join(cwd, 'build', 'cfe', 'keep.cfe'), 'utf8'), 'bin');
  const docs = ensureDocsScaffold(cwd);
  assert.equal(docs.complete, true);
  assert.equal(fs.existsSync(path.join(cwd, 'docs', 'techtask', 'README.md')), true);
  const again = ensureDocsScaffold(cwd);
  assert.deepEqual(again.created, []);
  const artifact = compiledArtifactPath(cwd, 'cfe', 'ShopExt', { now: new Date('2026-09-14T08:00:00') });
  assert.equal(artifact.relative, 'build/cfe/МоёРасширение_20260914.cfe'.replace('МоёРасширение', 'ShopExt'));
  assert.equal(artifact.relative, 'build/cfe/ShopExt_20260914.cfe');
});

function assertNoAgentCopy(cwd) {
  for (const rel of ['.pi/agents', '.pi/skills', '.pi/prompts', '.pi/rules-1c', 'AGENTS.md']) {
    assert.equal(fs.existsSync(path.join(cwd, rel)), false, rel);
  }
}

test('full /init always plants knowledge dirs even when Knowledge Layer is off', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-init-kn-off-'));
  const raw = template();
  const values = Object.fromEntries(parseEnvTemplate(raw).variables.map((x) => [x.name, x.defaultValue]));
  const result = applyProjectInitialization(cwd, {
    templateRaw: raw,
    values,
    projectName: 'K',
    configurationName: 'ERP',
    configurationVersion: '2.5',
    sourceRoot: 'src/cf',
    knowledgeEnabled: false,
    openSpecEnabled: false,
  });
  const layout = inspectKnowledgeLayout(cwd);
  assert.equal(layout.complete, true);
  assert.equal(fs.existsSync(path.join(cwd, '.pi', '1c', 'configuration.json')), false);
  assert.equal(result.knowledgeLayout.fingerprintInitialized, false);
  assertNoAgentCopy(cwd);
});

test('/init knowledge layout does not copy the agent or write .dev.env', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-kn-adopt-'));
  fs.mkdirSync(path.join(cwd, 'src', 'cf'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'cf', 'Configuration.xml'), '<?xml version="1.0"?><Configuration><Properties><Name>ERP</Name><Version>2.5.25.56</Version></Properties></Configuration>');
  const first = ensureProjectKnowledgeLayout(cwd, {
    projectName: 'Adopt',
    configurationName: 'ERP',
    configurationVersion: '2.5.25.56',
    sourceRoot: 'src/cf',
    fingerprint: true,
    writeManifests: true,
  });
  assert.equal(first.complete, true);
  assert.equal(first.fingerprintInitialized, true);
  assert.equal(fs.existsSync(path.join(cwd, '.dev.env')), false);
  assert.ok(fs.existsSync(path.join(cwd, '.pi', '1c', 'configuration.json')));
  assert.ok(fs.existsSync(path.join(cwd, '.pi', '1c', 'project.yaml')));
  assert.ok(fs.existsSync(path.join(cwd, '.pi', '1c', 'init-state.json')));
  assertNoAgentCopy(cwd);

  const draft = path.join(cwd, '.pi', '1c', 'knowledge-drafts', 'draft-keep.json');
  fs.writeFileSync(draft, `${JSON.stringify({ id: 'keep-me', statement: 'keep' }, null, 2)}\n`);
  const yamlBefore = fs.readFileSync(path.join(cwd, '.pi', '1c', 'project.yaml'), 'utf8');
  const second = ensureProjectKnowledgeLayout(cwd, {
    projectName: 'Adopt-overwrite',
    configurationName: 'OTHER',
    configurationVersion: '9.9',
    sourceRoot: 'src/cf',
    fingerprint: true,
    writeManifests: true,
  });
  assert.equal(second.fingerprintInitialized, false);
  assert.equal(second.configurationAlreadyPresent, true);
  assert.equal(fs.readFileSync(draft, 'utf8').includes('keep-me'), true);
  assert.equal(fs.readFileSync(path.join(cwd, '.pi', '1c', 'project.yaml'), 'utf8'), yamlBefore);
  const cfg = JSON.parse(fs.readFileSync(path.join(cwd, '.pi', '1c', 'configuration.json'), 'utf8'));
  assert.equal(cfg.name, 'ERP');
  assert.equal(fs.existsSync(path.join(cwd, '.dev.env')), false);
  assertNoAgentCopy(cwd);
});



