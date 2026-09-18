import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emitDiagnostic } from './diagnostics.mjs';

export const KNOWLEDGE_SCHEMA_VERSION = 1;
export const ITEM_KINDS = new Set(['fact', 'rule', 'preference', 'assumption']);
export const ITEM_SCOPES = new Set(['configuration', 'project']);
export const ITEM_STATUSES = new Set(['active', 'draft', 'disabled', 'superseded', 'stale']);
export const CONFIDENCE = new Set(['verified', 'high', 'medium', 'low', 'unknown']);

const EXCLUDED_DIRS = new Set(['.git', '.pi', 'node_modules', '.idea', '.vscode', 'dist', 'build']);
const FINGERPRINT_EXTS = new Set(['.bsl', '.os', '.xml', '.json', '.yaml', '.yml', '.mdo', '.txt']);

export function knowledgeRoot(cwd) { return path.join(cwd, '.pi', '1c'); }
export function configurationPath(cwd) { return path.join(knowledgeRoot(cwd), 'configuration.json'); }
export function fingerprintPath(cwd) { return path.join(knowledgeRoot(cwd), 'knowledge', 'fingerprint.json'); }
export function draftsDir(cwd) { return path.join(knowledgeRoot(cwd), 'knowledge-drafts'); }
export function itemsDir(cwd) { return path.join(knowledgeRoot(cwd), 'knowledge', 'items'); }
export function rulesDir(cwd, scope) { return path.join(knowledgeRoot(cwd), 'rules', scope); }
export function knowledgeLockPath(cwd) { return path.join(knowledgeRoot(cwd), 'knowledge.lock'); }
export function knowledgeTransactionsDir(cwd) {
  return path.join(knowledgeRoot(cwd), 'knowledge-transactions');
}

export function knowledgeHeadPath(cwd) {
  return path.join(knowledgeRoot(cwd), 'knowledge', 'HEAD');
}

export function committedSnapshotPath(cwd) {
  return path.join(knowledgeRoot(cwd), 'knowledge', 'committed.json');
}

export function ensureKnowledgeDirs(cwd) {
  for (const dir of [
    draftsDir(cwd), itemsDir(cwd), rulesDir(cwd, 'configuration'), rulesDir(cwd, 'project'), path.dirname(fingerprintPath(cwd)),
  ]) fs.mkdirSync(dir, { recursive: true });
}

function hashText(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function slug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';
}
function now() { return new Date().toISOString(); }
function unique(values) { return [...new Set((values ?? []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))]; }

export function versionMatches(range, version) {
  const r = String(range ?? '').trim();
  const v = String(version ?? '').trim();
  if (!r) return true;
  if (!v) return false;
  if (r === v) return true;
  const escaped = r.split('.').map((part) => {
    if (/^(?:x|X|\*)$/.test(part)) return '[^.]+';
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('\.');
  return new RegExp(`^${escaped}$`).test(v);
}

function pathOverlap(a, b) {
  const left = String(a ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  const right = String(b ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!left || !right) return false;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function sleepSync(ms) {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, Math.max(1, Number(ms) || 1));
}

export function knowledgeRevision(cwd) {
  const committed = readCommittedSnapshot(cwd);
  if (committed && Number.isFinite(Number(committed.revision))) return Number(committed.revision);
  const config = (() => {
    try { return loadConfiguration(cwd); } catch { return null; }
  })();
  return Number(config?.revision) || 0;
}

export function readCommittedSnapshot(cwd) {
  const file = committedSnapshotPath(cwd);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function writeCommittedSnapshot(cwd, { revision, items = [], configuration = null }) {
  const snapshot = {
    schema: 1,
    revision: Number(revision) || 0,
    updatedAt: now(),
    configuration: configuration || loadConfiguration(cwd),
    items: (items || []).map((item) => {
      const copy = { ...item };
      delete copy._file;
      return copy;
    }),
  };
  atomicWriteJson(committedSnapshotPath(cwd), snapshot);
  return snapshot;
}

export function acquireKnowledgeLock(cwd, { staleMs = 30_000, timeoutMs = 5_000 } = {}) {
  const dir = knowledgeLockPath(cwd);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const started = Date.now();
  while (true) {
    try {
      fs.mkdirSync(dir);
      const token = crypto.randomUUID();
      const owner = {
        token,
        pid: process.pid,
        host: os.hostname(),
        createdAt: Date.now(),
        heartbeatAt: Date.now(),
      };
      fs.writeFileSync(path.join(dir, 'owner.json'), `${JSON.stringify(owner)}\n`);
      return { dir, token };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const ownerFile = path.join(dir, 'owner.json');
        let stale = false;
        if (fs.existsSync(ownerFile)) {
          const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
          const beat = Number(owner.heartbeatAt || owner.createdAt || 0);
          stale = !beat || Date.now() - beat > staleMs;
        } else {
          const st = fs.statSync(dir);
          stale = Date.now() - st.mtimeMs > staleMs;
        }
        if (stale) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // retry
      }
      if (Date.now() - started > timeoutMs) throw new Error('knowledge lock timeout');
      sleepSync(20);
    }
  }
}

export function releaseKnowledgeLock(cwd, token) {
  const dir = knowledgeLockPath(cwd);
  const ownerFile = path.join(dir, 'owner.json');
  let owner = null;
  try { owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8')); } catch { owner = null; }
  if (token && owner && owner.token !== token) {
    throw new Error('knowledge lock ownership lost');
  }
  if (token && !owner) return false;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  return true;
}

export function withKnowledgeLock(cwd, fn) {
  const lock = acquireKnowledgeLock(cwd);
  try {
    return fn(lock);
  } finally {
    releaseKnowledgeLock(cwd, lock.token);
  }
}

export function precedenceOf(item) {
  if (item.status !== 'active') return -1;
  if (item.kind === 'rule' && item.scope === 'project') return 900 + Number(item.priority ?? 0) / 1000;
  if (item.kind === 'preference' && item.scope === 'project') return 850 + Number(item.priority ?? 0) / 1000;
  if (item.kind === 'rule' && item.scope === 'configuration') return 700 + Number(item.priority ?? 0) / 1000;
  if (item.kind === 'preference' && item.scope === 'configuration') return 650 + Number(item.priority ?? 0) / 1000;
  if (item.kind === 'fact' && item.scope === 'configuration' && item.confidence === 'verified') return 500;
  if (item.kind === 'fact' && item.scope === 'configuration') return 400;
  if (item.kind === 'assumption') return 100;
  return 200;
}

export function normalizeProposal(input, context = {}) {
  const action = ['add', 'update', 'invalidate', 'disable'].includes(input?.action) ? input.action : 'add';
  const kind = ITEM_KINDS.has(input?.kind) ? input.kind : 'assumption';
  let scope = ITEM_SCOPES.has(input?.scope) ? input.scope : (kind === 'fact' || kind === 'assumption' ? 'configuration' : 'project');
  if (kind === 'fact' && scope === 'project') scope = 'configuration';
  const topic = String(input?.topic ?? input?.title ?? 'general').trim();
  const statement = String(input?.statement ?? '').trim();
  const baseId = input?.id ? String(input.id) : `${scope}.${kind}.${slug(topic)}.${hashText(statement || topic).slice(0, 10)}`;
  const confidence = CONFIDENCE.has(input?.confidence) ? input.confidence : (kind === 'fact' ? 'medium' : 'unknown');
  const normalizeEvidencePath = (value) => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    let p = value.trim().split('\\').join('/');
    const sourceRoot = context.configuration?.sourceRoot;
    if (sourceRoot) {
      const rootNorm = String(sourceRoot).split('\\').join('/').replace(/^\.\//, '').replace(/\/$/, '');
      if (rootNorm && !path.isAbsolute(rootNorm) && p.startsWith(`${rootNorm}/`)) p = p.slice(rootNorm.length + 1);
    }
    return p.replace(/^\.\//, '');
  };
  const evidence = Array.isArray(input?.evidence) ? input.evidence.filter((e) => e && typeof e === 'object').map((e) => ({
    type: String(e.type ?? 'note'),
    path: normalizeEvidencePath(e.path),
    line: Number.isFinite(e.line) ? Number(e.line) : undefined,
    note: typeof e.note === 'string' ? e.note : undefined,
  })) : [];
  const currentVersion = context.configuration?.version;
  const item = {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    id: baseId,
    kind,
    scope,
    topic,
    title: String(input?.title ?? topic).trim(),
    statement,
    tags: unique(input?.tags),
    status: 'active',
    priority: Number.isFinite(input?.priority) ? Number(input.priority) : 0,
    confidence,
    provenance: {
      source: String(input?.provenance?.source ?? context.source ?? 'analysis'),
      input: typeof input?.provenance?.input === 'string' ? input.provenance.input : context.input,
      evidence,
    },
    appliesTo: {
      configuration: String(input?.appliesTo?.configuration ?? context.configuration?.name ?? '').trim() || undefined,
      versionRange: String(input?.appliesTo?.versionRange ?? (scope === 'configuration' ? currentVersion : '') ?? '').trim() || undefined,
      subsystems: unique(input?.appliesTo?.subsystems),
      objects: unique(input?.appliesTo?.objects),
      paths: unique(input?.appliesTo?.paths).map(normalizeEvidencePath).filter(Boolean),
    },
    createdAt: input?.createdAt ?? now(),
    updatedAt: now(),
    lastVerified: input?.lastVerified ?? (confidence === 'verified' ? now() : undefined),
    fingerprintAtVerification: input?.fingerprintAtVerification ?? (confidence === 'verified' && scope === 'configuration' ? context.configuration?.fingerprint : undefined),
    supersedes: unique(input?.supersedes),
  };
  return { action, targetId: input?.targetId ? String(input.targetId) : undefined, reason: input?.reason ? String(input.reason) : undefined, item };
}

export function validateItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object') return { ok: false, errors: ['item must be an object'] };
  if (!item.id || typeof item.id !== 'string') errors.push('id is required');
  if (!ITEM_KINDS.has(item.kind)) errors.push(`invalid kind: ${item.kind}`);
  if (!ITEM_SCOPES.has(item.scope)) errors.push(`invalid scope: ${item.scope}`);
  if (!ITEM_STATUSES.has(item.status)) errors.push(`invalid status: ${item.status}`);
  if (!item.statement || typeof item.statement !== 'string') errors.push('statement is required');
  if (!item.topic || typeof item.topic !== 'string') errors.push('topic is required');
  if (!CONFIDENCE.has(item.confidence)) errors.push(`invalid confidence: ${item.confidence}`);
  if (item.kind === 'fact' && item.scope !== 'configuration') errors.push('facts must use configuration scope');
  if (item.confidence === 'verified' && (item.provenance?.evidence?.length ?? 0) === 0) errors.push('verified item requires evidence');
  return { ok: errors.length === 0, errors };
}

export function canonicalItemPath(cwd, item) {
  if (item.kind === 'rule' || item.kind === 'preference') return path.join(rulesDir(cwd, item.scope), `${slug(item.id)}.json`);
  return path.join(itemsDir(cwd), `${slug(item.id)}.json`);
}

export function writeCanonicalItem(cwd, item) {
  const valid = validateItem(item);
  if (!valid.ok) throw new Error(`invalid knowledge item ${item?.id ?? ''}: ${valid.errors.join('; ')}`);
  ensureKnowledgeDirs(cwd);
  const file = canonicalItemPath(cwd, item);
  atomicWriteJson(file, item);
  return file;
}

function readJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...readJsonFiles(p));
    else if (ent.name.endsWith('.json')) {
      try { out.push({ file: p, value: JSON.parse(fs.readFileSync(p, 'utf8')) }); } catch {}
    }
  }
  return out;
}

function scanAllItems(cwd) {
  const records = [
    ...readJsonFiles(itemsDir(cwd)),
    ...readJsonFiles(rulesDir(cwd, 'configuration')),
    ...readJsonFiles(rulesDir(cwd, 'project')),
  ];
  return records.map((r) => ({ ...r.value, _file: r.file }));
}

export function loadAllItems(cwd) {
  const committed = readCommittedSnapshot(cwd);
  if (committed && Array.isArray(committed.items)) {
    return committed.items.map((item) => ({ ...item, _file: canonicalItemPath(cwd, item) }));
  }
  return scanAllItems(cwd);
}

export function findItem(cwd, id) {
  return loadAllItems(cwd).find((x) => x.id === id) ?? null;
}

export function loadConfiguration(cwd) {
  const committed = readCommittedSnapshot(cwd);
  if (committed?.configuration && typeof committed.configuration === 'object') return committed.configuration;
  const file = configurationPath(cwd);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function normalizeSourceRoot(cwd, sourceRoot) {
  const absolute = path.resolve(cwd, sourceRoot || '.');
  const rel = path.relative(cwd, absolute);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : absolute;
}

export function scanFingerprint(sourceRoot, { deep = false } = {}) {
  const root = path.resolve(sourceRoot);
  const index = {};
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ent.isDirectory() && EXCLUDED_DIRS.has(ent.name)) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(abs); continue; }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!FINGERPRINT_EXTS.has(ext)) continue;
      const rel = path.relative(root, abs).split(path.sep).join('/');
      const st = fs.statSync(abs);
      const record = { size: st.size, mtimeMs: Math.trunc(st.mtimeMs) };
      if (deep) record.sha256 = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
      index[rel] = record;
    }
  };
  walk(root);
  const fingerprint = hashText(JSON.stringify(Object.entries(index).sort(([a], [b]) => a.localeCompare(b))));
  return { fingerprint, strategy: deep ? 'content-v1' : 'metadata-v1', index, fileCount: Object.keys(index).length };
}

export function diffFingerprint(oldIndex = {}, newIndex = {}) {
  const oldKeys = new Set(Object.keys(oldIndex));
  const newKeys = new Set(Object.keys(newIndex));
  const added = [...newKeys].filter((k) => !oldKeys.has(k)).sort();
  const removed = [...oldKeys].filter((k) => !newKeys.has(k)).sort();
  const modified = [...newKeys].filter((k) => oldKeys.has(k) && JSON.stringify(oldIndex[k]) !== JSON.stringify(newIndex[k])).sort();
  return { added, removed, modified, changed: [...new Set([...added, ...removed, ...modified])].sort() };
}

export function initConfiguration(cwd, { name, version, family, sourceRoot = '.', deep = false }) {
  if (!name?.trim() || !version?.trim()) throw new Error('configuration name and version are required');
  ensureKnowledgeDirs(cwd);
  const storedRoot = normalizeSourceRoot(cwd, sourceRoot);
  const absRoot = path.resolve(cwd, sourceRoot);
  const scanned = scanFingerprint(absRoot, { deep });
  const config = {
    schemaVersion: 1,
    revision: 0,
    name: name.trim(),
    family: (family || name).trim(),
    version: version.trim(),
    sourceRoot: storedRoot,
    fingerprint: scanned.fingerprint,
    fingerprintStrategy: scanned.strategy,
    fileCount: scanned.fileCount,
    createdAt: now(),
    updatedAt: now(),
  };
  atomicWriteJson(configurationPath(cwd), config);
  atomicWriteJson(fingerprintPath(cwd), scanned.index);
  writeCommittedSnapshot(cwd, { revision: 0, items: [], configuration: config });
  return config;
}

export function computeConfigurationCandidate(cwd, { version, deep = false } = {}) {
  const config = loadConfiguration(cwd);
  if (!config) throw new Error('configuration is not initialized; run /config init in BUILD first');
  const sourceRoot = path.resolve(cwd, config.sourceRoot || '.');
  const scanned = scanFingerprint(sourceRoot, { deep });
  let oldIndex = {};
  try { if (fs.existsSync(fingerprintPath(cwd))) oldIndex = JSON.parse(fs.readFileSync(fingerprintPath(cwd), 'utf8')); } catch {}
  const diff = diffFingerprint(oldIndex, scanned.index);
  const candidate = { ...config, version: version?.trim() || config.version, fingerprint: scanned.fingerprint, fingerprintStrategy: scanned.strategy, fileCount: scanned.fileCount, updatedAt: now() };
  return { config, candidate, index: scanned.index, diff };
}

export function saveConfigurationCandidate(cwd, candidate, index) {
  ensureKnowledgeDirs(cwd);
  atomicWriteJson(configurationPath(cwd), candidate);
  atomicWriteJson(fingerprintPath(cwd), index);
}

export function createDraft(cwd, { source = 'analysis', input, proposals = [], meta = {} }) {
  ensureKnowledgeDirs(cwd);
  const configuration = loadConfiguration(cwd);
  const normalized = proposals.map((p) => normalizeProposal(p, { configuration, source, input }));
  const id = `draft-${Date.now()}-${hashText(JSON.stringify(normalized)).slice(0, 8)}`;
  const draft = { schemaVersion: 1, id, status: 'pending', source, input, createdAt: now(), proposals: normalized, meta };
  atomicWriteJson(path.join(draftsDir(cwd), `${id}.json`), draft);
  return draft;
}

export function loadDraft(cwd, draftId) {
  const file = path.join(draftsDir(cwd), `${draftId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function formatDraftChoice(draft) {
  const first = draft?.proposals?.[0]?.item ?? {};
  const scope = first.scope || '?';
  const kind = first.kind || '?';
  const topic = String(first.topic || draft?.input || 'draft').replace(/\s+/g, ' ').trim().slice(0, 48) || 'draft';
  const id = String(draft?.id ?? 'draft');
  const short = id.length > 8 ? id.slice(-8) : id;
  return `…${short} · ${scope}/${kind} · ${topic}`;
}

export function listDrafts(cwd, { status } = {}) {
  const dir = draftsDir(cwd);
  if (!fs.existsSync(dir)) return [];
  const drafts = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith('.json')) continue;
    try {
      const draft = JSON.parse(fs.readFileSync(path.join(dir, ent.name), 'utf8'));
      if (!draft?.id) continue;
      if (status && draft.status !== status) continue;
      drafts.push(draft);
    } catch {}
  }
  return drafts.sort((a, b) => {
    const ta = Date.parse(a.createdAt || '') || 0;
    const tb = Date.parse(b.createdAt || '') || 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
}

function updateExistingItem(cwd, existing, patch) {
  const next = { ...existing, ...patch, updatedAt: now() };
  delete next._file;
  const nextFile = writeCanonicalItem(cwd, next);
  if (existing._file && existing._file !== nextFile && fs.existsSync(existing._file)) fs.rmSync(existing._file, { force: true });
  return next;
}

export function auditDraft(cwd, draftOrId) {
  const draft = typeof draftOrId === 'string' ? loadDraft(cwd, draftOrId) : draftOrId;
  if (!draft) return { ok: false, errors: ['draft not found'], warnings: [] };
  const errors = [];
  const warnings = [];
  if (!['pending', 'applied', 'rejected'].includes(draft.status)) errors.push(`invalid draft status: ${draft.status}`);
  if (draft.status === 'rejected') errors.push('rejected draft cannot be applied');
  const canonical = loadAllItems(cwd);
  for (const [index, proposal] of (draft.proposals ?? []).entries()) {
    const label = `proposal ${index + 1}`;
    const { action, targetId, item } = proposal;
    if (!['add', 'update', 'invalidate', 'disable'].includes(action)) { errors.push(`${label}: invalid action '${action}'`); continue; }
    if (action === 'add') {
      const valid = validateItem(item);
      if (!valid.ok) errors.push(...valid.errors.map((x) => `${label}: ${x}`));
      const existing = canonical.find((x) => x.id === item?.id);
      if (existing) warnings.push(`${label}: id already exists and will be skipped: ${item.id}`);
    } else {
      const id = targetId || item?.id;
      const existing = canonical.find((x) => x.id === id);
      if (!existing) { errors.push(`${label}: target not found: ${id ?? '<missing>'}`); continue; }
      if (action === 'update') {
        const merged = { ...existing, ...item, id: existing.id, createdAt: existing.createdAt, status: item?.status ?? existing.status };
        delete merged._file;
        const valid = validateItem(merged);
        if (!valid.ok) errors.push(...valid.errors.map((x) => `${label}: ${x}`));
      }
    }
    if (item?.statement) {
      const duplicate = canonical.find((x) => x.status === 'active' && x.id !== item.id && normStatement(x.statement) === normStatement(item.statement));
      if (duplicate) warnings.push(`${label}: duplicate statement with ${duplicate.id}`);
      if ((item.kind === 'rule' || item.kind === 'preference') && item.topic) {
        const sameTopic = canonical.filter((x) => x.status === 'active' && (x.kind === 'rule' || x.kind === 'preference') && String(x.topic).toLowerCase() === String(item.topic).toLowerCase() && normStatement(x.statement) !== normStatement(item.statement));
        for (const other of sameTopic) warnings.push(`${label}: policy conflict with ${other.id} (precedence ${precedenceOf(other)})`);
      }
    }
  }
  const candidate = draft.meta?.configurationCandidate;
  if (candidate) {
    if (!candidate.name || !candidate.version || !candidate.fingerprint) errors.push('configuration candidate is incomplete');
    if (!draft.meta?.fingerprintIndex || typeof draft.meta.fingerprintIndex !== 'object') errors.push('configuration candidate is missing fingerprint index');
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function applyDraft(cwd, draftId, { expectedRevision, crashBeforeCommit = false } = {}) {
  return withKnowledgeLock(cwd, () => applyDraftLocked(cwd, draftId, { expectedRevision, crashBeforeCommit }));
}

function cloneItem(item) {
  const copy = { ...item };
  delete copy._file;
  return copy;
}

function workingItems(cwd) {
  const committed = readCommittedSnapshot(cwd);
  if (committed && Array.isArray(committed.items)) return committed.items.map(cloneItem);
  return scanAllItems(cwd).map(cloneItem);
}

function findWorking(items, id) {
  return items.find((x) => x.id === id) ?? null;
}

function stageKnowledgeTransaction(cwd, { revision, items, configuration, draft }) {
  const txId = crypto.randomUUID();
  const txDir = path.join(knowledgeTransactionsDir(cwd), `tx-${txId}`);
  fs.mkdirSync(path.join(txDir, 'items'), { recursive: true });
  const snapshot = {
    schema: 1,
    revision: Number(revision) || 0,
    updatedAt: now(),
    configuration,
    items: items.map(cloneItem),
  };
  fs.writeFileSync(path.join(txDir, 'configuration.json'), `${JSON.stringify(configuration, null, 2)}\n`);
  fs.writeFileSync(path.join(txDir, 'committed.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(txDir, 'manifest.json'), `${JSON.stringify({ txId, revision: snapshot.revision, draftId: draft?.id, createdAt: now() }, null, 2)}\n`);
  for (const item of items) {
    const dest = path.join(txDir, 'items', `${slug(item.id)}.json`);
    fs.writeFileSync(dest, `${JSON.stringify(item, null, 2)}\n`);
  }
  if (!fs.existsSync(path.join(txDir, 'committed.json'))) throw new Error('knowledge transaction missing committed snapshot');
  return { txDir, snapshot };
}

export function commitKnowledgePointer(cwd, snapshot) {
  const dest = committedSnapshotPath(cwd);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  atomicWriteJson(dest, snapshot);
  const headTmp = `${knowledgeHeadPath(cwd)}.tmp-${process.pid}`;
  fs.writeFileSync(headTmp, `${snapshot.revision}\n`);
  fs.renameSync(headTmp, knowledgeHeadPath(cwd));
  return dest;
}

function materializeCommittedTree(cwd, snapshot) {
  if (snapshot.configuration) atomicWriteJson(configurationPath(cwd), snapshot.configuration);
  for (const item of snapshot.items || []) writeCanonicalItem(cwd, item);
}

function applyDraftLocked(cwd, draftId, { expectedRevision, crashBeforeCommit = false } = {}) {
  const draft = loadDraft(cwd, draftId);
  if (!draft) throw new Error(`draft not found: ${draftId}`);
  if (draft.status === 'applied') return { draft, results: [], alreadyApplied: true };
  const currentRevision = knowledgeRevision(cwd);
  if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
    emitDiagnostic('knowledge.revision.conflict', { expected: expectedRevision, current: currentRevision, draftId });
    const err = new Error(`knowledge.revision.conflict: expected ${expectedRevision}, current ${currentRevision}`);
    err.code = 'knowledge.revision.conflict';
    throw err;
  }
  const preflight = auditDraft(cwd, draft);
  if (!preflight.ok) throw new Error(`draft preflight failed: ${preflight.errors.join('; ')}`);
  const results = [];
  if (preflight.warnings.length) results.push({ action: 'warnings', warnings: preflight.warnings });
  const items = workingItems(cwd);
  const upsert = (next) => {
    const idx = items.findIndex((x) => x.id === next.id);
    if (idx >= 0) items[idx] = cloneItem(next);
    else items.push(cloneItem(next));
  };
  for (const proposal of draft.proposals ?? []) {
    const { action, targetId, item, reason } = proposal;
    if (action === 'add') {
      const existing = findWorking(items, item.id);
      if (existing) results.push({ action: 'skip', id: item.id, reason: 'already exists' });
      else {
        upsert(item);
        for (const supersededId of item.supersedes ?? []) {
          const old = findWorking(items, supersededId);
          if (old) upsert({ ...old, status: 'superseded', supersededBy: item.id, updatedAt: now() });
        }
        results.push({ action: 'add', id: item.id });
      }
      continue;
    }
    const id = targetId || item?.id;
    const existing = id ? findWorking(items, id) : null;
    if (!existing) { results.push({ action: 'skip', id, reason: 'target not found' }); continue; }
    if (action === 'update') {
      const merged = { ...existing, ...item, id: existing.id, createdAt: existing.createdAt, updatedAt: now() };
      delete merged._file;
      upsert(merged);
      for (const supersededId of merged.supersedes ?? []) {
        if (supersededId === existing.id) continue;
        const old = findWorking(items, supersededId);
        if (old) upsert({ ...old, status: 'superseded', supersededBy: existing.id, updatedAt: now() });
      }
      results.push({ action: 'update', id: existing.id });
    } else if (action === 'invalidate') {
      upsert({ ...existing, status: 'stale', staleReason: reason || 'configuration changed', updatedAt: now() });
      results.push({ action: 'invalidate', id: existing.id });
    } else if (action === 'disable') {
      upsert({ ...existing, status: 'disabled', disabledReason: reason || 'disabled by approved draft', updatedAt: now() });
      results.push({ action: 'disable', id: existing.id });
    }
  }
  let configuration = { ...(loadConfiguration(cwd) || {}) };
  if (draft.meta?.configurationCandidate && draft.meta?.fingerprintIndex) {
    const before = loadConfiguration(cwd);
    const candidate = draft.meta.configurationCandidate;
    const carried = carryForwardVerifiedItems(cwd, {
      oldFingerprint: before?.fingerprint,
      newFingerprint: candidate.fingerprint,
      changedPaths: draft.meta?.diff?.changed ?? [],
      candidateVersion: candidate.version,
    });
    configuration = { ...configuration, ...candidate };
    if (carried.length) results.push({ action: 'carry-forward', ids: carried });
    results.push({ action: 'configuration-update', version: candidate.version, fingerprint: candidate.fingerprint });
  }
  const nextRevision = currentRevision + 1;
  configuration.revision = nextRevision;
  configuration.updatedAt = now();
  draft.status = 'applied';
  draft.appliedAt = now();
  const { snapshot } = stageKnowledgeTransaction(cwd, { revision: nextRevision, items, configuration, draft });
  if (crashBeforeCommit) {
    const err = new Error('knowledge crash before pointer switch');
    err.code = 'knowledge.crash-before-commit';
    throw err;
  }
  commitKnowledgePointer(cwd, snapshot);
  materializeCommittedTree(cwd, snapshot);
  atomicWriteJson(path.join(draftsDir(cwd), `${draftId}.json`), draft);
  return { draft, results, alreadyApplied: false, revision: nextRevision };
}

export function disableItem(cwd, id, reason = 'disabled by user') {
  const existing = findItem(cwd, id);
  if (!existing) throw new Error(`knowledge item not found: ${id}`);
  return updateExistingItem(cwd, existing, { status: 'disabled', disabledReason: reason });
}

function normStatement(value) { return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }

export function auditKnowledge(cwd) {
  const config = loadConfiguration(cwd);
  const items = loadAllItems(cwd);
  const active = items.filter((x) => x.status === 'active');
  const duplicates = [];
  const conflicts = [];
  const stale = items.filter((x) => x.status === 'stale').map((x) => x.id);
  const evidenceProblems = [];
  const byStatement = new Map();
  for (const item of active) {
    const key = normStatement(item.statement);
    if (key) {
      const prev = byStatement.get(key);
      if (prev) duplicates.push([prev.id, item.id]); else byStatement.set(key, item);
    }
    if (item.confidence === 'verified' && (item.provenance?.evidence?.length ?? 0) === 0) evidenceProblems.push(item.id);
    if (item.scope === 'configuration' && item.fingerprintAtVerification && config?.fingerprint && item.fingerprintAtVerification !== config.fingerprint) stale.push(item.id);
  }
  const byTopic = new Map();
  for (const item of active.filter((x) => x.kind === 'rule' || x.kind === 'preference')) {
    const key = `${item.topic}`.trim().toLowerCase();
    if (!key) continue;
    const list = byTopic.get(key) ?? [];
    list.push(item);
    byTopic.set(key, list);
  }
  for (const [topic, list] of byTopic) {
    const statements = new Set(list.map((x) => normStatement(x.statement)));
    if (statements.size > 1) {
      const sorted = [...list].sort((a, b) => precedenceOf(b) - precedenceOf(a));
      conflicts.push({ topic, winner: sorted[0].id, items: sorted.map((x) => ({ id: x.id, precedence: precedenceOf(x), statement: x.statement })) });
    }
  }
  return { configuration: config, counts: { total: items.length, active: active.length }, duplicates, conflicts, stale, evidenceProblems };
}

function tokens(value) {
  return new Set(String(value ?? '').toLowerCase().split(/[^a-z0-9а-яё_.-]+/i).filter((x) => x.length > 1));
}

export function queryKnowledge(cwd, query, { limit = 12, scopes, kinds } = {}) {
  const q = tokens(query);
  const config = loadConfiguration(cwd);
  const items = loadAllItems(cwd).filter((x) => x.status === 'active');
  const scopeSet = scopes?.length ? new Set(scopes) : null;
  const kindSet = kinds?.length ? new Set(kinds) : null;
  const scored = [];
  for (const item of items) {
    if (scopeSet && !scopeSet.has(item.scope)) continue;
    if (kindSet && !kindSet.has(item.kind)) continue;
    const hay = tokens([item.topic, item.title, item.statement, ...(item.tags ?? []), ...(item.appliesTo?.subsystems ?? []), ...(item.appliesTo?.objects ?? []), ...(item.appliesTo?.paths ?? [])].join(' '));
    let score = 0;
    for (const t of q) if (hay.has(t)) score += 5;
    if (String(item.statement).toLowerCase().includes(String(query).toLowerCase())) score += 10;
    score += Math.max(0, precedenceOf(item) / 100);
    if (item.confidence === 'verified') score += 2;
    if (item.fingerprintAtVerification && config?.fingerprint && item.fingerprintAtVerification !== config.fingerprint) score -= 8;
    if (score > 0 || q.size === 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || precedenceOf(b.item) - precedenceOf(a.item));
  return scored.slice(0, Math.max(1, Math.min(Number(limit) || 12, 50))).map(({ item, score }) => ({ ...item, _score: Number(score.toFixed(2)), _precedence: precedenceOf(item) }));
}

export function automaticInvalidations(cwd, changedPaths, { candidateVersion } = {}) {
  const changed = [...new Set(changedPaths ?? [])];
  const proposals = [];
  for (const item of loadAllItems(cwd).filter((x) => x.status === 'active')) {
    const evidencePaths = (item.provenance?.evidence ?? []).map((e) => e.path).filter(Boolean);
    const appliesPaths = item.appliesTo?.paths ?? [];
    const pathChanged = [...evidencePaths, ...appliesPaths].some((p) => changed.some((c) => pathOverlap(p, c)));
    const versionChanged = item.scope === 'configuration' && candidateVersion && item.appliesTo?.versionRange
      ? !versionMatches(item.appliesTo.versionRange, candidateVersion)
      : false;
    if (!pathChanged && !versionChanged) continue;
    const reasons = [];
    if (pathChanged) reasons.push('evidence/applicable path changed in configuration fingerprint diff');
    if (versionChanged) reasons.push(`version binding '${item.appliesTo.versionRange}' does not include ${candidateVersion}`);
    proposals.push({ action: 'invalidate', targetId: item.id, kind: item.kind, scope: item.scope, topic: item.topic, statement: item.statement, reason: reasons.join('; ') });
  }
  return proposals;
}

function carryForwardVerifiedItems(cwd, { oldFingerprint, newFingerprint, changedPaths = [], candidateVersion }) {
  if (!oldFingerprint || !newFingerprint || oldFingerprint === newFingerprint) return [];
  const carried = [];
  for (const item of loadAllItems(cwd).filter((x) => x.status === 'active' && x.scope === 'configuration' && x.confidence === 'verified')) {
    if (item.fingerprintAtVerification !== oldFingerprint) continue;
    if (item.appliesTo?.versionRange && candidateVersion && !versionMatches(item.appliesTo.versionRange, candidateVersion)) continue;
    const evidencePaths = (item.provenance?.evidence ?? []).map((e) => e.path).filter(Boolean);
    const appliesPaths = item.appliesTo?.paths ?? [];
    if ([...evidencePaths, ...appliesPaths].some((p) => changedPaths.some((c) => pathOverlap(p, c)))) continue;
    updateExistingItem(cwd, item, { fingerprintAtVerification: newFingerprint, carriedForwardAt: now(), carriedForwardFromFingerprint: oldFingerprint });
    carried.push(item.id);
  }
  return carried;
}

export function parseKnowledgeProposals(text) {
  if (typeof text !== 'string') return { ok: false, errors: ['output is not text'] };
  const marker = '## Knowledge Proposals';
  const idx = text.lastIndexOf(marker);
  if (idx < 0) return { ok: false, errors: [`missing '${marker}' section`] };
  const tail = text.slice(idx + marker.length);
  const fenced = tail.match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) return { ok: false, errors: ['missing fenced JSON array'] };
  let value;
  try { value = JSON.parse(fenced[1]); } catch (error) { return { ok: false, errors: [`invalid JSON: ${error.message}`] }; }
  if (!Array.isArray(value)) return { ok: false, errors: ['knowledge proposals must be an array'] };
  return { ok: true, proposals: value };
}
