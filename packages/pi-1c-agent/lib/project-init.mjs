import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  draftsDir,
  ensureKnowledgeDirs,
  fingerprintPath,
  initConfiguration,
  itemsDir,
  knowledgeRoot,
  loadConfiguration,
  rulesDir,
} from './knowledge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
export const DEV_ENV_SCHEMA_PATH = path.join(packageRoot, 'config', 'dev-env.schema.json');


export const STANDARD_SOURCE_DIRS = Object.freeze(['cf', 'cfe', 'epf', 'erf']);
export const BUILD_LAYOUT_ROOT = 'build';
export const DOCS_LAYOUT_ROOT = 'docs';
export const DOCS_TECHTASK_DIR = 'techtask';
export const COMPILED_KIND_EXT = Object.freeze({ cf: 'cf', cfe: 'cfe', epf: 'epf', erf: 'erf' });

function projectRelative(cwd, absolute) {
  const rel = path.relative(cwd, absolute);
  return (rel || '.').split(path.sep).join('/');
}

function assertInsideProject(cwd, candidate, label = 'path') {
  const base = path.resolve(cwd);
  const absolute = path.resolve(cwd, candidate || '.');
  const rel = path.relative(base, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${label} must stay inside the project directory: ${candidate}`);
  }
  return absolute;
}

export function inferSourceLayoutRoot(cwd, configurationSourceRoot = '.') {
  const normalized = String(configurationSourceRoot || '.').replace(/\\/g, '/').replace(/\/$/, '') || '.';
  const baseName = path.posix.basename(normalized).toLowerCase();
  if (STANDARD_SOURCE_DIRS.includes(baseName)) {
    const parent = path.posix.dirname(normalized);
    return parent === '.' ? '.' : parent;
  }
  if (normalized !== '.') return normalized;
  return fs.existsSync(path.join(cwd, 'src')) ? 'src' : 'src';
}

export function configurationRootForLayout(_cwd, detectedConfiguration, sourceLayoutRoot) {
  if (detectedConfiguration?.file && detectedConfiguration?.sourceRoot) {
    return String(detectedConfiguration.sourceRoot).split(path.sep).join('/');
  }
  const root = String(sourceLayoutRoot || 'src').replace(/\\/g, '/').replace(/\/$/, '') || '.';
  return root === '.' ? 'cf' : `${root}/cf`;
}

export function inspectSourceScaffold(cwd, sourceLayoutRoot = 'src') {
  const rootAbs = assertInsideProject(cwd, sourceLayoutRoot || 'src', 'source layout root');
  const root = projectRelative(cwd, rootAbs);
  const directories = STANDARD_SOURCE_DIRS.map((name) => {
    const absolute = path.join(rootAbs, name);
    let exists = false;
    try { exists = fs.statSync(absolute).isDirectory(); } catch {}
    return { name, absolute, path: projectRelative(cwd, absolute), exists };
  });
  return {
    root,
    absoluteRoot: rootAbs,
    directories,
    missing: directories.filter((x) => !x.exists).map((x) => x.path),
    complete: directories.every((x) => x.exists),
  };
}

export function ensureSourceScaffold(cwd, sourceLayoutRoot = 'src') {
  const before = inspectSourceScaffold(cwd, sourceLayoutRoot);
  fs.mkdirSync(before.absoluteRoot, { recursive: true });
  const created = [];
  const existing = [];
  for (const item of before.directories) {
    if (item.exists) existing.push(item.path);
    else {
      fs.mkdirSync(item.absolute, { recursive: true });
      created.push(item.path);
    }
  }
  const after = inspectSourceScaffold(cwd, sourceLayoutRoot);
  return { ...after, created, existing };
}

export function inspectBuildScaffold(cwd) {
  return inspectSourceScaffold(cwd, BUILD_LAYOUT_ROOT);
}

export function ensureBuildScaffold(cwd) {
  return ensureSourceScaffold(cwd, BUILD_LAYOUT_ROOT);
}

function pad2(n) { return String(n).padStart(2, '0'); }

export function dateStamp(now = new Date()) {
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
}

export function dateTimeStamp(now = new Date()) {
  return `${dateStamp(now)}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}

export function sanitizeArtifactBaseName(originalName) {
  const base = path.basename(String(originalName || 'artifact'), path.extname(String(originalName || '')));
  const cleaned = base.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return cleaned || 'artifact';
}

/** Compiled file name: OriginalName_YYYYMMDD.ext; if that file exists, append -HHmmss. */
export function compiledArtifactFileName(originalName, extension, { now = new Date(), exists } = {}) {
  const ext = String(extension || '').replace(/^\./, '');
  const base = sanitizeArtifactBaseName(originalName);
  const primary = `${base}_${dateStamp(now)}.${ext}`;
  if (typeof exists === 'function' && exists(primary)) return `${base}_${dateTimeStamp(now)}.${ext}`;
  return primary;
}

export function compiledArtifactPath(cwd, kind, originalName, { now = new Date(), existsSync = fs.existsSync } = {}) {
  if (!STANDARD_SOURCE_DIRS.includes(kind)) throw new Error(`unknown compiled artifact kind: ${kind}`);
  const ext = COMPILED_KIND_EXT[kind];
  const dir = path.join(path.resolve(cwd), BUILD_LAYOUT_ROOT, kind);
  const fileName = compiledArtifactFileName(originalName, ext, {
    now,
    exists: (name) => existsSync(path.join(dir, name)),
  });
  return {
    kind,
    dir,
    fileName,
    relative: `${BUILD_LAYOUT_ROOT}/${kind}/${fileName}`,
    absolute: path.join(dir, fileName),
  };
}

const DOCS_README = `# Документация проекта

Оформленные документы лежат здесь.

Сырые технические задания агенту — в \`techtask/\`.
`;

const TECHTASK_README = `# Сырые технические задания

Кладём сюда исходные ТЗ агенту: черновики, переписку, неформализованные формулировки.

Оформленная документация проекта — в каталоге \`docs/\` уровнем выше.
`;

export function inspectDocsScaffold(cwd) {
  const rootAbs = assertInsideProject(cwd, DOCS_LAYOUT_ROOT, 'docs root');
  const techtaskAbs = path.join(rootAbs, DOCS_TECHTASK_DIR);
  const directories = [
    { name: 'docs', absolute: rootAbs, path: projectRelative(cwd, rootAbs) },
    { name: 'techtask', absolute: techtaskAbs, path: projectRelative(cwd, techtaskAbs) },
  ].map((item) => {
    let exists = false;
    try { exists = fs.statSync(item.absolute).isDirectory(); } catch {}
    return { ...item, exists };
  });
  return {
    root: DOCS_LAYOUT_ROOT,
    absoluteRoot: rootAbs,
    directories,
    missing: directories.filter((x) => !x.exists).map((x) => x.path),
    complete: directories.every((x) => x.exists),
  };
}

export function ensureDocsScaffold(cwd) {
  const before = inspectDocsScaffold(cwd);
  const created = [];
  const existing = [];
  for (const item of before.directories) {
    if (item.exists) existing.push(item.path);
    else {
      fs.mkdirSync(item.absolute, { recursive: true });
      created.push(item.path);
    }
  }
  const docsReadme = path.join(before.absoluteRoot, 'README.md');
  const techtaskReadme = path.join(before.absoluteRoot, DOCS_TECHTASK_DIR, 'README.md');
  if (!fs.existsSync(docsReadme)) fs.writeFileSync(docsReadme, DOCS_README);
  if (!fs.existsSync(techtaskReadme)) fs.writeFileSync(techtaskReadme, TECHTASK_README);
  const after = inspectDocsScaffold(cwd);
  return { ...after, created, existing };
}

export function loadDevEnvSchema() {
  return JSON.parse(fs.readFileSync(DEV_ENV_SCHEMA_PATH, 'utf8'));
}

export function parseEnvTemplate(raw) {
  const variables = [];
  const lines = raw.split(/\r?\n/);
  let comments = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) {
      comments.push(line);
      if (comments.length > 40) comments = comments.slice(-40);
      continue;
    }
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) { comments = []; continue; }
    variables.push({ name: m[1], defaultValue: m[2], line: i + 1, comments: comments.join('\n') });
    comments = [];
  }
  return { raw, lines, variables };
}

export function parseEnvValues(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function renderEnvFromTemplate(templateRaw, values) {
  const seen = new Set();
  const rendered = templateRaw.split(/\r?\n/).map((line) => {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) return line;
    seen.add(m[1]);
    if (!Object.prototype.hasOwnProperty.call(values, m[1])) return line;
    const value = String(values[m[1]] ?? '');
    if (/\r|\n/.test(value)) throw new Error(`Invalid multiline .dev.env value for ${m[1]}`);
    return `${m[1]}=${value}`;
  }).join('\n').replace(/\n*$/, '\n');
  const extras = Object.entries(values).filter(([name]) => !seen.has(name));
  if (!extras.length) return rendered;
  const lines = ['# Local extra variables preserved by pi-1c-agent'];
  for (const [name, raw] of extras) {
    const value = String(raw ?? '');
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
    if (/\r|\n/.test(value)) throw new Error(`Invalid multiline .dev.env value for ${name}`);
    lines.push(`${name}=${value}`);
  }
  return `${rendered.replace(/\n*$/, '\n')}\n${lines.join('\n')}\n`;
}

export function locateDevEnvExample(cwd) {
  const candidates = [
    path.join(cwd, '.pi', 'rules-1c', 'upstream-.dev.env.example'),
    path.join(cwd, '.dev.env.example'),
    path.join(cwd, '.pi', 'rules-1c', '.dev.env.example'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function auditDevEnvSchema(templateRaw, schema = loadDevEnvSchema()) {
  const parsed = parseEnvTemplate(templateRaw);
  const discovered = parsed.variables.map((x) => x.name);
  const known = schema.variables.map((x) => x.name);
  const unknown = discovered.filter((x) => !known.includes(x));
  const missing = known.filter((x) => !discovered.includes(x));
  const duplicates = discovered.filter((x, i) => discovered.indexOf(x) !== i);
  return { discovered, known, unknown, missing, duplicates, ok: unknown.length === 0 && missing.length === 0 && duplicates.length === 0 };
}

function walk(dir, depth, out) {
  if (depth < 0 || !fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.pi'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, depth - 1, out);
    else if (ent.name === 'Configuration.xml') out.push(p);
  }
}

export function detectConfiguration(cwd) {
  const files = [];
  walk(cwd, 3, files);
  const preferred = files.sort((a, b) => {
    const score = (p) => (/[/\\]src[/\\]Configuration\.xml$/i.test(p) ? 0 : /[/\\]cf[/\\]Configuration\.xml$/i.test(p) ? 1 : 2);
    return score(a) - score(b) || a.length - b.length;
  })[0];
  if (!preferred) return { file: null, sourceRoot: '.', name: '', version: '', compatibilityMode: '' };
  let raw = '';
  try { raw = fs.readFileSync(preferred, 'utf8'); } catch {}
  const get = (tag) => raw.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))?.[1]?.trim() ?? '';
  return {
    file: preferred,
    sourceRoot: path.relative(cwd, path.dirname(preferred)) || '.',
    name: get('Name'),
    version: get('Version'),
    compatibilityMode: get('CompatibilityMode').replace(/^Version/i, '').replace(/_/g, '.'),
  };
}

function versionParts(s) { return String(s).split(/[^0-9]+/).filter(Boolean).map(Number); }
function compareVersions(a, b) {
  const aa = versionParts(a), bb = versionParts(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const d = (aa[i] ?? 0) - (bb[i] ?? 0); if (d) return d;
  }
  return 0;
}

export function detectPlatformPath() {
  const candidates = [];
  const roots = process.platform === 'win32'
    ? [path.join(process.env.ProgramFiles ?? 'C:\\Program Files', '1cv8'), path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', '1cv8')]
    : ['/opt/1cv8/x86_64', '/opt/1cv8'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(root, ent.name);
      const exe = process.platform === 'win32' ? path.join(dir, 'bin', '1cv8.exe') : path.join(dir, '1cv8');
      const alt = process.platform === 'win32' ? path.join(dir, 'bin', '1cv8c.exe') : path.join(dir, '1cv8c');
      if (fs.existsSync(exe) || fs.existsSync(alt)) candidates.push({ dir, version: ent.name });
    }
  }
  candidates.sort((a, b) => compareVersions(b.version, a.version));
  return candidates[0]?.dir ?? '';
}

export function autoDetectedValues(cwd, { sourceLayoutRoot, configurationSourceRoot } = {}) {
  const config = detectConfiguration(cwd);
  const layoutRoot = sourceLayoutRoot || inferSourceLayoutRoot(cwd, config.sourceRoot || '.');
  const configRoot = configurationSourceRoot || configurationRootForLayout(cwd, config, layoutRoot);
  const normalizedLayout = String(layoutRoot || '.').replace(/\\/g, '/').replace(/\/$/, '') || '.';
  const extensionRoot = normalizedLayout === '.' ? 'cfe' : `${normalizedLayout}/cfe`;
  return {
    PLATFORM_VERSION: config.compatibilityMode || '',
    PLATFORM_PATH: detectPlatformPath(),
    EXPORT_PATH: configRoot === '.' ? '' : configRoot,
    EXTENSIONS_PATH: extensionRoot,
  };
}

export function effectiveVariableMeta(templateRaw, schema = loadDevEnvSchema()) {
  const parsed = parseEnvTemplate(templateRaw);
  const byName = new Map(schema.variables.map((x) => [x.name, x]));
  return parsed.variables.map((v) => ({
    ...v,
    ...(byName.get(v.name) ?? { group: 'unknown', title: v.name, description: 'Переменная появилась в upstream и ещё не получила специализированное UX-описание.', class: 'unknown' }),
    templateDefault: v.defaultValue,
  }));
}

export function isSecretVariable(name, schema = loadDevEnvSchema()) {
  return Boolean(schema.variables.find((x) => x.name === name)?.secret);
}

export function redactValue(name, value, schema = loadDevEnvSchema()) {
  if (!value) return '(пусто)';
  return isSecretVariable(name, schema) ? '*** настроено ***' : String(value);
}

/** Non-secret values that often match across sibling 1C projects on the same machine. */
export const SHARED_HINT_NAMES = [
  'PREFIX', 'COMPANY', 'DEVELOPER', 'PLATFORM_VERSION', 'PLATFORM_PATH',
  'COMMENT_OPEN', 'COMMENT_CLOSE', 'NEW_OBJECTS_IN', 'USE_EDT',
  'SUPPORT_GUARD', 'NEW_OBJECT_POSITION', 'CAVEMAN',
  'ORCHESTRATION', 'VERIFICATION_DEPTH', 'DEBUG_FAST_PATH', 'QUICKFIX_MAX_LINES',
  'AGENT_MODEL', 'SUBAGENT_MODEL_CODING', 'SUBAGENT_MODEL_ANALYSIS', 'SUBAGENT_MODEL_LIGHT',
  'UI_TESTING', 'SUPPORT_EMAIL', 'SUPPORT_API_URL',
];

const SKIP_SIBLING_DIR_NAMES = new Set(['node_modules', 'vendor', '.git', 'build', 'release', 'tmp', 'temp']);
const MAX_SIBLING_DIRS = 40;

export function looksLikeOneCProject(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
  } catch {
    return false;
  }
  return [
    '.dev.env',
    path.join('src', 'cf', 'Configuration.xml'),
    'Configuration.xml',
    path.join('.pi', '1c', 'project.yaml'),
    '.dev.env.example',
  ].some((rel) => fs.existsSync(path.join(dir, rel)));
}

function majorityValue(entries) {
  const counts = new Map();
  for (const { value } of entries) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = entries[0].value;
  let bestCount = 0;
  for (const [value, n] of counts) {
    if (n > bestCount) { best = value; bestCount = n; }
  }
  return { value: best, count: bestCount };
}

/**
 * Read-only scan of sibling directories one level up. Never copies secrets.
 * Returns proposed shared .dev.env values with source project names.
 */
export function collectSiblingSharedEnv(cwd, schema = loadDevEnvSchema()) {
  const current = path.resolve(cwd);
  const parent = path.dirname(current);
  const suggestions = [];
  if (!parent || parent === current) return { parent, projects: [], suggestions };
  let names = [];
  try {
    names = fs.readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_SIBLING_DIR_NAMES.has(e.name))
      .map((e) => e.name)
      .slice(0, MAX_SIBLING_DIRS);
  } catch {
    return { parent, projects: [], suggestions };
  }

  const byName = new Map();
  const projects = [];
  for (const name of names) {
    const dir = path.join(parent, name);
    if (path.resolve(dir) === current) continue;
    if (!looksLikeOneCProject(dir)) continue;
    const envFile = path.join(dir, '.dev.env');
    if (!fs.existsSync(envFile)) {
      projects.push({ name, hasEnv: false });
      continue;
    }
    let values = {};
    try { values = parseEnvValues(fs.readFileSync(envFile, 'utf8')); } catch { continue; }
    projects.push({ name, hasEnv: true });
    for (const key of SHARED_HINT_NAMES) {
      if (isSecretVariable(key, schema)) continue;
      const value = String(values[key] ?? '').trim();
      if (!value) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ value, from: name });
    }
  }

  for (const name of SHARED_HINT_NAMES) {
    const entries = byName.get(name);
    if (!entries?.length) continue;
    const picked = majorityValue(entries);
    const sources = [...new Set(entries.filter((e) => e.value === picked.value).map((e) => e.from))];
    const alternatives = [...new Set(entries.filter((e) => e.value !== picked.value).map((e) => e.value))];
    suggestions.push({
      name,
      value: picked.value,
      sources,
      agreement: picked.count,
      sampleCount: entries.length,
      alternatives,
    });
  }
  return { parent, projects, suggestions };
}

export function summarizeEnv(templateRaw, values, decisions = {}, schema = loadDevEnvSchema()) {
  return effectiveVariableMeta(templateRaw, schema).map((meta) => {
    const value = String(values[meta.name] ?? '');
    const decision = decisions[meta.name] ?? null;
    const state = decision?.state ?? (value ? 'configured' : (meta.templateDefault || meta.default ? 'default' : 'empty'));
    return { name: meta.name, group: meta.group, state, secret: Boolean(meta.secret), value: redactValue(meta.name, value, schema) };
  });
}

function yamlString(v) { return JSON.stringify(String(v ?? '')); }
export function buildProjectYaml({ projectName, configurationName, configurationVersion, sourceRoot, sourceLayoutRoot, envSummary, initializedAt, knowledgeEnabled = true, openSpecEnabled = false, sourceScaffoldEnabled = true, buildScaffoldEnabled = true, docsScaffoldEnabled = true }) {
  const layoutRoot = sourceLayoutRoot || inferSourceLayoutRoot('.', sourceRoot || '.');
  const normalizedLayout = String(layoutRoot || '.').replace(/\\/g, '/').replace(/\/$/, '') || '.';
  const layoutPath = (name) => normalizedLayout === '.' ? name : `${normalizedLayout}/${name}`;
  const lines = [
    'schemaVersion: 1',
    `initializedAt: ${yamlString(initializedAt)}`,
    'project:',
    `  name: ${yamlString(projectName)}`,
    'configuration:',
    `  name: ${yamlString(configurationName)}`,
    `  version: ${yamlString(configurationVersion)}`,
    `  sourceRoot: ${yamlString(sourceRoot || '.')}`,
    'sourceLayout:',
    `  enabled: ${sourceScaffoldEnabled ? 'true' : 'false'}`,
    `  root: ${yamlString(normalizedLayout)}`,
    `  cf: ${yamlString(layoutPath('cf'))}`,
    `  cfe: ${yamlString(layoutPath('cfe'))}`,
    `  epf: ${yamlString(layoutPath('epf'))}`,
    `  erf: ${yamlString(layoutPath('erf'))}`,
    'buildLayout:',
    `  enabled: ${buildScaffoldEnabled ? 'true' : 'false'}`,
    `  root: ${yamlString(BUILD_LAYOUT_ROOT)}`,
    `  cf: ${yamlString(`${BUILD_LAYOUT_ROOT}/cf`)}`,
    `  cfe: ${yamlString(`${BUILD_LAYOUT_ROOT}/cfe`)}`,
    `  epf: ${yamlString(`${BUILD_LAYOUT_ROOT}/epf`)}`,
    `  erf: ${yamlString(`${BUILD_LAYOUT_ROOT}/erf`)}`,
    `  naming: "OriginalName_YYYYMMDD"`,
    'docsLayout:',
    `  enabled: ${docsScaffoldEnabled ? 'true' : 'false'}`,
    `  root: ${yamlString(DOCS_LAYOUT_ROOT)}`,
    `  techtask: ${yamlString(`${DOCS_LAYOUT_ROOT}/${DOCS_TECHTASK_DIR}`)}`,
    'features:',
    `  configurationKnowledge: ${knowledgeEnabled ? 'true' : 'false'}`,
    `  openspec: ${openSpecEnabled ? 'true' : 'false'}`,
    'environment:',
    '  source: ".dev.env"',
    `  variableCount: ${envSummary.length}`,
    '  variables:',
  ];
  for (const item of envSummary) lines.push(`    ${item.name}: ${item.state}`);
  return `${lines.join('\n')}\n`;
}

function atomicWrite(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
  if (mode && process.platform !== 'win32') try { fs.chmodSync(file, mode); } catch {}
}

function knowledgeLayoutDirectories(cwd) {
  return [
    { rel: 'knowledge', absolute: path.dirname(fingerprintPath(cwd)) },
    { rel: 'knowledge/items', absolute: itemsDir(cwd) },
    { rel: 'knowledge-drafts', absolute: draftsDir(cwd) },
    { rel: 'rules/configuration', absolute: rulesDir(cwd, 'configuration') },
    { rel: 'rules/project', absolute: rulesDir(cwd, 'project') },
  ].map((item) => {
    let exists = false;
    try { exists = fs.statSync(item.absolute).isDirectory(); } catch {}
    return { path: `.pi/1c/${item.rel}`, absolute: item.absolute, exists };
  });
}

export function inspectKnowledgeLayout(cwd) {
  const directories = knowledgeLayoutDirectories(cwd);
  return {
    root: '.pi/1c',
    directories,
    missing: directories.filter((x) => !x.exists).map((x) => x.path),
    complete: directories.every((x) => x.exists),
    configuration: loadConfiguration(cwd),
  };
}

function writeMinimalKnowledgeManifests(cwd, {
  projectName,
  configurationName,
  configurationVersion,
  sourceRoot,
  knowledgeEnabled,
}) {
  const stateDir = knowledgeRoot(cwd);
  const projectYaml = path.join(stateDir, 'project.yaml');
  const initState = path.join(stateDir, 'init-state.json');
  const created = [];
  const initializedAt = new Date().toISOString();
  const name = projectName || path.basename(cwd);
  if (!fs.existsSync(projectYaml)) {
    atomicWrite(projectYaml, buildProjectYaml({
      projectName: name,
      configurationName: configurationName || '',
      configurationVersion: configurationVersion || '',
      sourceRoot: sourceRoot || '.',
      envSummary: [],
      initializedAt,
      knowledgeEnabled,
      openSpecEnabled: false,
      sourceScaffoldEnabled: false,
      buildScaffoldEnabled: false,
      docsScaffoldEnabled: false,
    }));
    created.push('.pi/1c/project.yaml');
  }
  if (!fs.existsSync(initState)) {
    atomicWrite(initState, `${JSON.stringify({
      schemaVersion: 1,
      initializedAt,
      projectName: name,
      configurationName: configurationName || '',
      configurationVersion: configurationVersion || '',
      sourceRoot: sourceRoot || '.',
      knowledgeLayout: true,
      knowledgeEnabled,
      openSpecEnabled: false,
      mode: 'knowledge',
    }, null, 2)}\n`);
    created.push('.pi/1c/init-state.json');
  }
  return { projectYaml, initState, created };
}

/**
 * Plant project-local knowledge dirs (and optionally fingerprint + minimal manifests).
 * Does not copy the agent, OpenSpec artifacts, .dev.env, or AGENTS.md.
 */
export function ensureProjectKnowledgeLayout(cwd, {
  projectName,
  configurationName,
  configurationVersion,
  sourceRoot = '.',
  fingerprint = false,
  writeManifests = true,
} = {}) {
  const before = inspectKnowledgeLayout(cwd);
  const configurationAlreadyPresent = Boolean(before.configuration);
  ensureKnowledgeDirs(cwd);
  const after = inspectKnowledgeLayout(cwd);
  const created = after.directories.filter((item) => !before.directories.find((x) => x.path === item.path)?.exists).map((x) => x.path);
  const existing = after.directories.filter((item) => before.directories.find((x) => x.path === item.path)?.exists).map((x) => x.path);

  let configuration = before.configuration;
  let fingerprintInitialized = false;
  if (fingerprint && !configurationAlreadyPresent && String(configurationName || '').trim() && String(configurationVersion || '').trim()) {
    configuration = initConfiguration(cwd, {
      name: configurationName,
      version: configurationVersion,
      family: configurationName,
      sourceRoot: sourceRoot || '.',
    });
    fingerprintInitialized = true;
  }

  let manifestsCreated = [];
  let projectYaml = path.join(knowledgeRoot(cwd), 'project.yaml');
  let initState = path.join(knowledgeRoot(cwd), 'init-state.json');
  if (writeManifests) {
    const manifests = writeMinimalKnowledgeManifests(cwd, {
      projectName,
      configurationName: configurationName || configuration?.name,
      configurationVersion: configurationVersion || configuration?.version,
      sourceRoot: sourceRoot || configuration?.sourceRoot || '.',
      knowledgeEnabled: Boolean(configuration || fingerprint),
    });
    projectYaml = manifests.projectYaml;
    initState = manifests.initState;
    manifestsCreated = manifests.created;
  }

  return {
    root: '.pi/1c',
    directories: after.directories,
    created,
    existing,
    complete: after.complete,
    configuration: configuration || loadConfiguration(cwd),
    fingerprintInitialized,
    configurationAlreadyPresent,
    manifestsCreated,
    projectYaml,
    initState,
  };
}

export function ensureGitignore(cwd) {
  const file = path.join(cwd, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const have = new Set(current.split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const required = ['.dev.env', 'build/'];
  const missing = required.filter((line) => !have.has(line));
  if (!missing.length) return false;
  const prefix = current.replace(/\s*$/, '');
  const next = `${prefix}${prefix ? '\n' : ''}${missing.join('\n')}\n`;
  atomicWrite(file, next);
  return true;
}

export function applyProjectInitialization(cwd, { templateRaw, values, decisions = {}, projectName, configurationName, configurationVersion, sourceRoot, sourceLayoutRoot, sourceScaffoldEnabled = true, buildScaffoldEnabled = true, docsScaffoldEnabled = true, knowledgeEnabled = true, openSpecEnabled = false }) {
  const envPath = path.join(cwd, '.dev.env');
  const stateDir = path.join(cwd, '.pi', '1c');
  const initializedAt = new Date().toISOString();
  const envRaw = renderEnvFromTemplate(templateRaw, values);
  const summary = summarizeEnv(templateRaw, values, decisions);
  const layoutRoot = sourceLayoutRoot || inferSourceLayoutRoot(cwd, sourceRoot || '.');
  const scaffold = sourceScaffoldEnabled ? ensureSourceScaffold(cwd, layoutRoot) : inspectSourceScaffold(cwd, layoutRoot);
  const buildScaffold = buildScaffoldEnabled ? ensureBuildScaffold(cwd) : inspectBuildScaffold(cwd);
  const docsScaffold = docsScaffoldEnabled ? ensureDocsScaffold(cwd) : inspectDocsScaffold(cwd);
  const knowledgeLayout = ensureProjectKnowledgeLayout(cwd, {
    projectName,
    configurationName,
    configurationVersion,
    sourceRoot,
    fingerprint: knowledgeEnabled,
    writeManifests: false,
  });
  atomicWrite(envPath, envRaw, 0o600);
  ensureGitignore(cwd);
  atomicWrite(path.join(stateDir, 'project.yaml'), buildProjectYaml({
    projectName,
    configurationName,
    configurationVersion,
    sourceRoot,
    sourceLayoutRoot: layoutRoot,
    envSummary: summary,
    initializedAt,
    knowledgeEnabled,
    openSpecEnabled,
    sourceScaffoldEnabled,
    buildScaffoldEnabled,
    docsScaffoldEnabled,
  }));
  atomicWrite(path.join(stateDir, 'init-state.json'), `${JSON.stringify({
    schemaVersion: 1,
    initializedAt,
    projectName,
    configurationName,
    configurationVersion,
    sourceRoot,
    sourceLayoutRoot: layoutRoot,
    sourceScaffoldEnabled,
    sourceScaffold: {
      root: scaffold.root,
      directories: scaffold.directories.map((x) => x.path),
      created: scaffold.created ?? [],
      existing: scaffold.existing ?? [],
      complete: scaffold.complete,
    },
    buildScaffoldEnabled,
    buildScaffold: {
      root: buildScaffold.root,
      directories: buildScaffold.directories.map((x) => x.path),
      created: buildScaffold.created ?? [],
      existing: buildScaffold.existing ?? [],
      complete: buildScaffold.complete,
    },
    docsScaffoldEnabled,
    docsScaffold: {
      root: docsScaffold.root,
      directories: docsScaffold.directories.map((x) => x.path),
      created: docsScaffold.created ?? [],
      existing: docsScaffold.existing ?? [],
      complete: docsScaffold.complete,
    },
    knowledgeEnabled,
    openSpecEnabled,
    envPath: '.dev.env',
    variables: Object.fromEntries(summary.map((x) => [x.name, { state: x.state, secret: x.secret }])),
  }, null, 2)}\n`);
  return {
    envPath,
    projectYaml: path.join(stateDir, 'project.yaml'),
    initState: path.join(stateDir, 'init-state.json'),
    summary,
    scaffold,
    buildScaffold,
    docsScaffold,
    knowledgeLayout,
  };
}

export function initStatus(cwd) {
  const example = locateDevEnvExample(cwd);
  const envFile = path.join(cwd, '.dev.env');
  const stateFile = path.join(cwd, '.pi', '1c', 'init-state.json');
  let state = null;
  try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  let audit = null;
  if (example) audit = auditDevEnvSchema(fs.readFileSync(example, 'utf8'));
  const values = fs.existsSync(envFile) ? parseEnvValues(fs.readFileSync(envFile, 'utf8')) : {};
  let scaffold = null;
  let buildScaffold = null;
  if (state?.sourceLayoutRoot || state?.sourceRoot) {
    try { scaffold = inspectSourceScaffold(cwd, state.sourceLayoutRoot || inferSourceLayoutRoot(cwd, state.sourceRoot || '.')); } catch {}
  }
  try { buildScaffold = inspectBuildScaffold(cwd); } catch {}
  let docsScaffold = null;
  try { docsScaffold = inspectDocsScaffold(cwd); } catch {}
  let knowledgeLayout = null;
  try { knowledgeLayout = inspectKnowledgeLayout(cwd); } catch {}
  return { example, envFile: fs.existsSync(envFile) ? envFile : null, state, audit, scaffold, buildScaffold, docsScaffold, knowledgeLayout, configuredCount: Object.values(values).filter((x) => String(x).length > 0).length };
}
