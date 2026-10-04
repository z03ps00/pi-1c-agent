import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { classifyDanger } from '../approve-policy.mjs';
import { createDraft } from '../knowledge.mjs';
import { prepareWrite } from '../memory-write.mjs';
import { queuePendingRecord } from '../memory-reconcile.mjs';
import { hasUnredactableSecret, redact } from '../redact.mjs';
import { parseManifest } from './skills.mjs';

export const LEARNING_MODES = Object.freeze(['off', 'safe', 'auto']);
export const PROCEDURE_THRESHOLD = 3;
const CHECK_TOOLS = new Set(['syntaxcheck', 'check_1c_code', 'review_1c_code']);
const ROLES = new Set([
  'explorer', 'analytic', 'architect', 'arch-reviewer', 'planner', 'developer',
  'metadata-manager', 'refactoring', 'performance-optimizer', 'error-fixer',
  'tester', 'code-reviewer', 'doc-writer',
]);
const STOP = new Set(['для', 'как', 'что', 'это', 'при', 'без', 'все', 'уже', 'ещё', 'еще', 'the', 'and', 'for', 'with', 'from', 'into', 'only', 'наши', 'ваши', 'или', 'над', 'под', 'про']);
const FACT_RE = /(регистр|справочник|документ|обработк|отч[её]т)/i;
const FACT_USE_RE = /(использу|остатк|хранит|служит)/i;
const DECISION_RE = /(расширен|только в)/i;

export function learningFile(profileDir) {
  return path.join(profileDir, 'state', 'evolution', 'learning.json');
}

export function learnedRoot(profileDir) {
  return path.join(profileDir, 'state', 'evolution', 'learned');
}

export function learnedSkillsDir(profileDir) {
  return path.join(learnedRoot(profileDir), 'skills');
}

function journalFile(profileDir) {
  return path.join(profileDir, 'state', 'evolution', 'friction.json');
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function normalizeLearningMode(value) {
  const mode = String(value ?? '').trim().toLowerCase();
  return LEARNING_MODES.includes(mode) ? mode : '';
}

export function readLearningMode(profileDir) {
  const mode = normalizeLearningMode(readJson(learningFile(profileDir), {}).mode);
  return mode || 'safe';
}

export function writeLearningMode(profileDir, value) {
  const mode = normalizeLearningMode(value);
  if (!mode) return { ok: false, reason: `unknown learning mode ${value}` };
  writeJson(learningFile(profileDir), { mode });
  return { ok: true, mode };
}

function tokensOf(text) {
  const parts = String(text || '').toLowerCase().split(/[^a-z0-9а-яё]+/i).filter((part) => part.length >= 3 && !STOP.has(part));
  return [...new Set(parts)];
}

function toolEntries(experience) {
  const raw = Array.isArray(experience?.tools) ? experience.tools : [];
  return raw.map((tool) => {
    if (typeof tool === 'string') return { name: tool, dangerous: classifyDanger(tool, {}).dangerous };
    const name = String(tool?.name || '');
    const dangerous = typeof tool?.dangerous === 'boolean' ? tool.dangerous : classifyDanger(name, tool?.input || {}).dangerous;
    return { name, dangerous, role: tool?.role ? String(tool.role) : '' };
  }).filter((tool) => tool.name);
}

function roleNames(experience, tools) {
  const listed = Array.isArray(experience?.roles) ? experience.roles : [];
  const fromTools = tools.map((tool) => tool.role).filter(Boolean);
  return [...listed, ...fromTools].map((role) => String(role).replace(/^1c-/, '')).filter((role) => ROLES.has(role));
}

function failureOf(experience) {
  const verification = experience?.verification;
  if (verification === 'fail' || verification?.ok === false) return true;
  if (Array.isArray(experience?.reviewerFindings) && experience.reviewerFindings.length) return true;
  if (Array.isArray(experience?.bslErrors) && experience.bslErrors.length) return true;
  return false;
}

function cleanText(value) {
  const redacted = redact(String(value ?? ''));
  if (hasUnredactableSecret(redacted.text)) return { ok: false, text: '' };
  return { ok: true, text: redacted.text };
}

export function analyzeExperience(experience = {}) {
  const task = cleanText(experience.task || experience.subject || '');
  if (!task.ok) return { reusable: false, type: '', fingerprint: '', reason: 'secret' };
  const tools = toolEntries(experience);
  const roles = roleNames(experience, tools);
  const words = tokensOf(task.text).sort();
  const base = { task: task.text, words, tools, roles };
  if (tools.length >= 3) {
    const names = tools.map((tool) => tool.name.toLowerCase());
    const fingerprint = `procedure|${names.join('>')}|${words.join(' ')}`.slice(0, 180);
    return { reusable: true, type: 'procedure', fingerprint, reason: 'repeated tool sequence', ...base };
  }
  if (failureOf(experience)) {
    const subject = cleanText((experience.reviewerFindings || experience.bslErrors || [task.text])[0] || task.text);
    if (!subject.ok) return { reusable: false, type: '', fingerprint: '', reason: 'secret' };
    const fingerprint = `failure|${tokensOf(subject.text).sort().join(' ')}`.slice(0, 180);
    return { reusable: true, type: 'failure', fingerprint, reason: 'verification or review failure', ...base, task: subject.text };
  }
  if (roles.length >= 3) {
    const fingerprint = `pipeline|${roles.join('>')}`.slice(0, 180);
    return { reusable: true, type: 'pipeline', fingerprint, reason: 'role sequence', ...base };
  }
  if (DECISION_RE.test(task.text)) {
    const fingerprint = `decision|${words.join(' ')}`.slice(0, 180);
    return { reusable: true, type: 'decision', fingerprint, reason: 'target container decision', ...base };
  }
  if (FACT_RE.test(task.text) && FACT_USE_RE.test(task.text)) {
    const fingerprint = `fact|${words.join(' ')}`.slice(0, 180);
    return { reusable: true, type: 'fact', fingerprint, reason: 'configuration fact', ...base };
  }
  return { reusable: false, type: '', fingerprint: '', reason: '' };
}

function bumpPattern(profileDir, fingerprint, type) {
  const journal = readJson(journalFile(profileDir), { signals: {} });
  const current = journal.signals[fingerprint] || { type, subject: fingerprint.split('|').slice(1).join('|'), count: 0 };
  current.count += 1;
  journal.signals[fingerprint] = current;
  writeJson(journalFile(profileDir), journal);
  return current.count;
}

function yamlScalar(value) {
  const text = String(value ?? '');
  if (!text || /[:#\n"'[\]]/.test(text) || text !== text.trim()) return JSON.stringify(text);
  return text;
}

export function emitManifest(manifest) {
  const learning = manifest.learning || {};
  const lines = [
    `id: ${yamlScalar(manifest.id)}`,
    `version: ${yamlScalar(manifest.version || '0.1.0')}`,
    `description: ${yamlScalar(manifest.description || '')}`,
    `status: ${yamlScalar(manifest.status || 'draft')}`,
    'triggers:',
  ];
  for (const trigger of manifest.triggers || []) lines.push(`  - ${yamlScalar(trigger)}`);
  if (!(manifest.triggers || []).length) lines.push('  - ""');
  lines.push('requires:', '  any: []', 'optional: []', 'modes:');
  for (const mode of manifest.modes?.length ? manifest.modes : ['build']) lines.push(`  - ${yamlScalar(mode)}`);
  lines.push('cost:', '  context: low', 'quality:', `  level: ${yamlScalar(manifest.quality || 'candidate')}`, 'learning:', `  successes: ${Number(learning.successes) || 0}`, `  failures: ${Number(learning.failures) || 0}`);
  if (manifest.tools?.length) {
    lines.push('tools:');
    for (const tool of manifest.tools) lines.push(`  - ${yamlScalar(tool)}`);
  }
  return `${lines.join('\n')}\n`;
}

function skillId(words, fingerprint) {
  const slug = words.slice(0, 4).join('-').replace(/[^a-z0-9а-яё-]+/gi, '').replace(/^-|-$/g, '').slice(0, 48);
  if (slug) return slug;
  return `procedure-${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 8)}`;
}

function skillMarkdown(id, triggers, steps) {
  const when = (triggers.length ? triggers : [id]).map((item) => `- ${item}`).join('\n');
  const order = steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  return `# ${id}\n\n## Когда использовать\n${when}\n\n## Порядок\n${order}\n`;
}

function testsYaml(id) {
  return `scenarios:\n  - name: ${yamlScalar(id)}\n`;
}

export function evaluateSkillBundle(dir) {
  const manifestPath = path.join(dir, 'manifest.yaml');
  const skillPath = path.join(dir, 'SKILL.md');
  const testsPath = path.join(dir, 'tests.yaml');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(skillPath) || !fs.existsSync(testsPath)) {
    return { ok: false, reason: 'skill bundle is incomplete' };
  }
  let manifest;
  try { manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8')); } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (!manifest.id || manifest.id !== path.basename(dir)) return { ok: false, reason: 'manifest id does not match the directory' };
  if (!manifest.triggers?.length) return { ok: false, reason: 'triggers are empty' };
  const body = fs.readFileSync(skillPath, 'utf8');
  if (!body.includes('## Когда использовать') || !/^\d+\. /m.test(body)) return { ok: false, reason: 'SKILL.md is missing when-to-use or ordered steps' };
  const tests = fs.readFileSync(testsPath, 'utf8');
  if (!/scenarios:/.test(tests) || !/- name:/.test(tests)) return { ok: false, reason: 'tests.yaml has no scenario' };
  const combined = `${fs.readFileSync(manifestPath, 'utf8')}\n${body}\n${tests}`;
  if (hasUnredactableSecret(combined) || redact(combined).text !== combined) return { ok: false, reason: 'skill bundle contains a secret' };
  return { ok: true, manifest, reason: '' };
}

function writeBundle(profileDir, analysis) {
  const id = skillId(analysis.words, analysis.fingerprint);
  const dir = path.join(learnedSkillsDir(profileDir), id);
  const manifest = {
    id,
    version: '0.1.0',
    description: analysis.task.slice(0, 180),
    status: 'draft',
    triggers: analysis.words.slice(0, 5),
    modes: ['build'],
    quality: 'candidate',
    learning: { successes: 0, failures: 0 },
    tools: analysis.tools.map((tool) => tool.name),
  };
  if (!manifest.triggers.length) manifest.triggers = [id];
  const steps = analysis.tools.map((tool) => tool.name);
  const files = {
    manifest: emitManifest(manifest),
    skill: skillMarkdown(id, manifest.triggers, steps),
    tests: testsYaml(id),
  };
  const secret = `${files.manifest}\n${files.skill}\n${files.tests}`;
  if (hasUnredactableSecret(secret) || redact(secret).text !== secret) {
    return { ok: false, reason: 'secret', id, created: false, activated: false };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.yaml'), files.manifest);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), files.skill);
  fs.writeFileSync(path.join(dir, 'tests.yaml'), files.tests);
  const draft = {
    id,
    kind: 'skill',
    status: 'draft',
    subject: analysis.task.slice(0, 180),
    fingerprint: analysis.fingerprint,
    bundleDir: dir,
    createdAt: new Date().toISOString(),
  };
  writeJson(path.join(profileDir, 'state', 'evolution', 'drafts', `${id}.json`), draft);
  return { ok: true, id, dir, manifest, created: true, activated: false };
}

function activateManifest(dir, manifest) {
  const next = {
    ...manifest,
    status: 'active',
    quality: manifest.quality === 'verified' || manifest.quality === 'experimental' ? manifest.quality : 'candidate',
    learning: manifest.learning || { successes: 0, failures: 0 },
  };
  fs.writeFileSync(path.join(dir, 'manifest.yaml'), emitManifest(next));
  return next;
}

export function approveLearnedSkill(profileDir, draftId) {
  const id = String(draftId || '').trim();
  const dir = path.join(learnedSkillsDir(profileDir), id);
  if (!id || !fs.existsSync(path.join(dir, 'manifest.yaml'))) return { handled: false };
  const evaluated = evaluateSkillBundle(dir);
  if (!evaluated.ok) return { handled: true, ok: false, activated: false, reason: evaluated.reason };
  const manifest = activateManifest(dir, evaluated.manifest);
  const draftPath = path.join(profileDir, 'state', 'evolution', 'drafts', `${id}.json`);
  const draft = readJson(draftPath, null);
  if (draft) {
    draft.status = 'approved';
    draft.approvedAt = new Date().toISOString();
    writeJson(draftPath, draft);
  }
  return { handled: true, ok: true, activated: true, id: manifest.id, message: `Skill ${manifest.id} is active.` };
}

function toolsAreSafe(tools) {
  return tools.every((tool) => tool.dangerous === false);
}

function writeLesson(profileDir, analysis) {
  const id = `lesson-${crypto.createHash('sha256').update(analysis.fingerprint).digest('hex').slice(0, 8)}`;
  const file = path.join(learnedRoot(profileDir), 'lessons', `${id}.md`);
  if (fs.existsSync(file)) return { ok: true, id, created: false, activated: false, status: 'draft' };
  const body = `---\nstatus: draft\nid: ${id}\n---\n\n# ${id}\n\n${analysis.task}\n`;
  if (redact(body).text !== body || hasUnredactableSecret(body)) return { ok: false, reason: 'secret', created: false, activated: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return { ok: true, id, created: true, activated: false, status: 'draft' };
}

function writeWorkflow(profileDir, analysis) {
  const id = `pipeline-${crypto.createHash('sha256').update(analysis.fingerprint).digest('hex').slice(0, 8)}`;
  const file = path.join(learnedRoot(profileDir), 'workflows', `${id}.yaml`);
  if (fs.existsSync(file)) return { ok: true, id, created: false, activated: false, status: 'draft' };
  const triggers = analysis.words.slice(0, 5);
  const lines = [`name: ${yamlScalar(id)}`, 'status: draft', 'triggers:'];
  for (const trigger of (triggers.length ? triggers : [id])) lines.push(`  - ${yamlScalar(trigger)}`);
  lines.push('stages:');
  for (const role of analysis.roles) lines.push(`  - 1c-${role}`);
  const body = `${lines.join('\n')}\n`;
  if (redact(body).text !== body) return { ok: false, reason: 'secret', created: false, activated: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return { ok: true, id, created: true, activated: false, status: 'draft' };
}

function writeKnowledge(cwd, analysis) {
  if (!cwd) return { ok: false, reason: 'no project cwd', created: false, activated: false };
  const kind = analysis.type === 'decision' ? 'rule' : 'fact';
  const draft = createDraft(cwd, {
    source: 'learning',
    input: analysis.task,
    proposals: [{
      action: 'add',
      kind,
      scope: 'project',
      topic: analysis.words[0] || kind,
      title: analysis.words.slice(0, 4).join(' ') || kind,
      statement: analysis.task,
      confidence: 'medium',
    }],
  });
  return { ok: true, id: draft.id, created: true, activated: false, status: draft.status, kind };
}

export function reviewExperience(profileDir, experience = {}, options = {}) {
  const anonLevel = Number(options.anonLevel ?? experience.anonLevel ?? 0);
  if (anonLevel > 0) {
    return { ok: true, skipped: true, reason: 'anonymous', message: 'Learning: skipped — anonymous', created: false, activated: false };
  }
  const sessionMode = options.sessionMode || experience.sessionMode || 'build';
  if (sessionMode === 'ask' || sessionMode === 'plan') {
    return { ok: true, skipped: true, reason: sessionMode, created: false, activated: false };
  }
  const mode = options.mode || readLearningMode(profileDir);
  const analysis = analyzeExperience(experience);
  if (!analysis.reusable) return { ok: true, reusable: false, created: false, activated: false, reason: analysis.reason };
  if (analysis.reason === 'secret') return { ok: false, reason: 'secret', created: false, activated: false };
  const count = bumpPattern(profileDir, analysis.fingerprint, analysis.type);
  if (mode === 'off') return { ok: true, count, type: analysis.type, created: false, activated: false };
  if (analysis.type === 'procedure') {
    if (count < PROCEDURE_THRESHOLD) return { ok: true, count, type: 'procedure', created: false, activated: false };
    const existing = path.join(learnedSkillsDir(profileDir), skillId(analysis.words, analysis.fingerprint), 'manifest.yaml');
    if (fs.existsSync(existing)) return { ok: true, count, type: 'procedure', id: path.basename(path.dirname(existing)), created: false, activated: false };
    const written = writeBundle(profileDir, analysis);
    if (!written.ok) return { ok: false, reason: written.reason, created: false, activated: false };
    const evaluated = evaluateSkillBundle(written.dir);
    if (!evaluated.ok) return { ok: true, count, type: 'procedure', id: written.id, created: true, activated: false, reason: evaluated.reason };
    if (mode === 'auto' && toolsAreSafe(analysis.tools)) {
      activateManifest(written.dir, evaluated.manifest);
      const draftPath = path.join(profileDir, 'state', 'evolution', 'drafts', `${written.id}.json`);
      const draft = readJson(draftPath, null);
      if (draft) {
        draft.status = 'approved';
        writeJson(draftPath, draft);
      }
      return { ok: true, count, type: 'procedure', id: written.id, created: true, activated: true, message: `Skill ${written.id} is active.` };
    }
    const why = mode === 'auto' ? 'dangerous tool keeps the skill a draft' : 'waiting for /evolve approve';
    return { ok: true, count, type: 'procedure', id: written.id, created: true, activated: false, message: `Procedure ${written.id} is a draft. ${why}.`, reason: why };
  }
  if (count > 1) return { ok: true, count, type: analysis.type, created: false, activated: false };
  const stored = analysis.type === 'failure'
    ? writeLesson(profileDir, analysis)
    : analysis.type === 'pipeline'
      ? writeWorkflow(profileDir, analysis)
      : writeKnowledge(options.cwd || experience.cwd, analysis);
  return { ok: stored.ok !== false, count, type: analysis.type, ...stored, activated: false };
}

export function queueLearningMemory({ profileDir, candidate, connected = false, anonLevel = 0, cwd = profileDir, date = new Date().toISOString().slice(0, 10) } = {}) {
  if (!candidate?.id) return { ok: false, reason: 'no candidate', queued: 0 };
  if (!connected || anonLevel > 0) return { ok: true, queued: 0, skipped: true };
  const fact = prepareWrite({
    content: `Learned ${candidate.type || 'lesson'} ${candidate.id}: ${candidate.reason || candidate.message || ''}`.trim(),
    task: `learn-${candidate.id}`,
    agent: 'pi-1c-harness',
    date,
    cwd,
    target: 'memory',
  });
  const report = prepareWrite({
    content: `Learning rationale for ${candidate.type || 'lesson'} ${candidate.id}. ${candidate.message || candidate.reason || ''}`.trim(),
    task: `learn-${candidate.id}`,
    agent: 'pi-1c-harness',
    date,
    cwd,
    target: 'knowledge',
  });
  if (!fact.ok || !report.ok) return { ok: true, queued: 0, skipped: true, reason: fact.reason || report.reason };
  queuePendingRecord(profileDir, { ...fact.record, status: 'queued' });
  queuePendingRecord(profileDir, { ...report.record, status: 'queued' });
  return { ok: true, queued: 2, skipped: false };
}

function walkLearned(dir, kind) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = entry.isDirectory() ? path.join(dir, entry.name, 'manifest.yaml') : path.join(dir, entry.name);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const status = (raw.match(/^status:\s*(\S+)/m) || [])[1] || 'draft';
    out.push({ id: entry.name.replace(/\.md$|\.yaml$/, ''), kind, status });
  }
  return out;
}

export function listLearned(profileDir) {
  const root = learnedRoot(profileDir);
  return [
    ...walkLearned(path.join(root, 'skills'), 'skill'),
    ...walkLearned(path.join(root, 'lessons'), 'lesson'),
    ...walkLearned(path.join(root, 'workflows'), 'workflow'),
  ];
}

export function countPendingCandidates(profileDir) {
  return listLearned(profileDir).filter((item) => item.status === 'draft').length;
}

export function formatLearningReview(profileDir) {
  const rows = listLearned(profileDir).filter((item) => item.status === 'deactivated' || item.status === 'draft');
  if (!rows.length) return '';
  return `\n${rows.map((item) => `- ${item.id} [${item.status}] ${item.kind}`).join('\n')}`;
}

export function learningStatus(profileDir) {
  const mode = readLearningMode(profileDir);
  const pending = countPendingCandidates(profileDir);
  return { mode, pending, text: `learning:${mode}. Pending candidates: ${pending}.` };
}

function loadSkillManifest(dir) {
  const file = path.join(dir, 'manifest.yaml');
  if (!fs.existsSync(file)) return null;
  try { return { file, manifest: parseManifest(fs.readFileSync(file, 'utf8')) }; } catch { return null; }
}

export function recordSkillUse(profileDir, skillId, outcome) {
  if (outcome !== 'success' && outcome !== 'failure') return { changed: false };
  const loaded = loadSkillManifest(path.join(learnedSkillsDir(profileDir), skillId));
  if (!loaded || loaded.manifest.status === 'draft' || loaded.manifest.status === 'deactivated') return { changed: false };
  const manifest = loaded.manifest;
  const learning = {
    successes: Number(manifest.learning?.successes) || 0,
    failures: Number(manifest.learning?.failures) || 0,
  };
  if (outcome === 'success') learning.successes += 1;
  if (outcome === 'failure') learning.failures += 1;
  let status = manifest.status || 'active';
  let quality = manifest.quality || 'candidate';
  if (learning.failures >= 2) status = 'deactivated';
  else if (learning.successes >= 3) quality = 'verified';
  else if (learning.successes >= 1) quality = 'experimental';
  fs.writeFileSync(loaded.file, emitManifest({ ...manifest, status, quality, learning }));
  return { changed: true, status, quality, learning };
}

export function matchActiveWorkflows(profileDir, text) {
  const dir = path.join(learnedRoot(profileDir), 'workflows');
  if (!fs.existsSync(dir)) return [];
  const hay = String(text || '').toLowerCase();
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.yaml')) continue;
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file, 'utf8');
    const status = (raw.match(/^status:\s*(\S+)/m) || [])[1] || 'draft';
    if (status !== 'active') continue;
    const triggers = [];
    let inTriggers = false;
    for (const line of raw.split(/\n/)) {
      if (/^triggers:/.test(line)) { inTriggers = true; continue; }
      if (inTriggers && /^\S/.test(line)) break;
      const item = inTriggers ? line.match(/^\s+-\s+(.+)$/) : null;
      if (item) triggers.push(item[1].replace(/^["']|["']$/g, '').toLowerCase());
    }
    if (!triggers.some((trigger) => trigger && hay.includes(trigger))) continue;
    out.push({ id: name.replace(/\.yaml$/, ''), text: raw, file });
  }
  return out;
}

export function isCheckTool(name) {
  return CHECK_TOOLS.has(String(name || ''));
}
