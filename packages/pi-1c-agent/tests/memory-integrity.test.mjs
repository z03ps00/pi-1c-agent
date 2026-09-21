import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasUnredactableSecret, loadExactSecretValues, redact } from '../lib/redact.mjs';
import { buildIdempotencyKey, contentHash } from '../lib/memory-key.mjs';
import { deriveProjectId, normalizeWorkspacePath, slugProjectId, writeProjectIdMarker } from '../lib/project-id.mjs';
import { formatMemoryStatus, prepareWrite, sessionCaptureDocumentUri, writeWithVerify } from '../lib/memory-write.mjs';
import {
  ANON_KNOWLEDGE_READ_TOOLS,
  ANON_MEMORY_READ_TOOLS,
  evaluateAnonMcpCall,
  fallbackAnonVerdict,
} from '../lib/plan-policy.mjs';
import { MEMORY_MUTATORS, anonMutatorFallbackRegex, isMemoryMutator } from '../lib/memory-mutators.mjs';

test('redacts each secret kind and blocks leftovers', () => {
  const mixed = [
    'fact: port is 8001',
    'password=hunter2',
    'Authorization: Bearer abcdef0123456789',
    'Cookie: sid=abc',
    'postgres://u:s3cret@localhost/db',
    'sk-abcdefghijklmnopqrstuvwxyz012345',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc',
    'API_KEY=supersecretvalue',
    '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----',
  ].join('\n');
  const out = redact(mixed);
  assert.ok(out.kinds.includes('password'));
  assert.ok(out.kinds.includes('authorization'));
  assert.ok(out.kinds.includes('cookie'));
  assert.ok(out.kinds.includes('dsn'));
  assert.ok(out.kinds.includes('api_key'));
  assert.ok(out.kinds.includes('token'));
  assert.ok(out.kinds.includes('secret_store'));
  assert.ok(out.kinds.includes('private_key'));
  assert.match(out.text, /\[REDACTED:password\]/);
  assert.doesNotMatch(out.text, /hunter2/);
  assert.equal(hasUnredactableSecret(out.text), false);
  assert.equal(hasUnredactableSecret('password=still-here'), true);
});

test('content hash is after redaction and key is stable', () => {
  const a = redact('decision: use port 8001 password=one').text;
  const b = redact('decision: use port 8001 password=two').text;
  assert.equal(contentHash(a), contentHash(b));
  const rawHash = contentHash('decision: use port 8001 password=one');
  assert.notEqual(contentHash(a), rawHash);
  const key1 = buildIdempotencyKey({ task: 't', agent: 'pi', date: '2026-09-16', contentHash: contentHash(a) });
  const key2 = buildIdempotencyKey({ task: 't', agent: 'pi', date: '2026-09-16', contentHash: contentHash(b) });
  assert.equal(key1, key2);
  assert.match(key1, /^task=t; agent=pi; date=2026-09-16; content_hash=[0-9a-f]{64}$/);
});

test('project-id ignores trailing space and bind-mount prefix', () => {
  const a = deriveProjectId({ cwd: '/tmp/work/projects_code/1c-pi-profile ' });
  const b = deriveProjectId({ cwd: '/var/data/projects_code/1c-pi-profile ' });
  const c = deriveProjectId({ cwd: '/var/data/projects_code/1c-pi-profile' });
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a, '1c-pi-profile');
  assert.equal(normalizeWorkspacePath('/tmp/foo '), '/tmp/foo');
  assert.equal(deriveProjectId({ gitRemote: 'git@github.com:acme/demo.git' }), 'acme/demo');
  assert.equal(deriveProjectId({ marker: 'My Project ' }), 'my-project');
});

test('cyrillic folder names slug instead of collapsing to unknown', () => {
  const cwd = '/mnt/vol/data/projects_code/Тестирование открытие форм пользователей по истории';
  const id = deriveProjectId({ cwd });
  assert.equal(id.startsWith('testirovanie-otkrytie-form'), true);
  assert.notEqual(id, 'unknown');
  assert.match(sessionCaptureDocumentUri(id, 'sess-1'), /session-captures\/testirovanie-otkrytie-form/);
  assert.match(sessionCaptureDocumentUri(id, 'sess-1'), /\/sess-1\.md$/);
  assert.equal(slugProjectId(''), 'unknown');
  assert.match(slugProjectId('项目名称'), /^p-[0-9a-f]{8}$/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi1c-pid-'));
  const wrote = writeProjectIdMarker(tmp, 'Тестирование форм');
  assert.equal(wrote.created, true);
  assert.equal(deriveProjectId({ cwd: tmp }), wrote.id);
  assert.equal(writeProjectIdMarker(tmp, 'Other').created, false);
});

test('verify-after-write confirms or queues UNCONFIRMED', async () => {
  const prep = prepareWrite({ content: 'fact: ok', task: 't', agent: 'pi', date: '2026-09-16', cwd: '/tmp/demo' });
  assert.equal(prep.ok, true);
  assert.equal(prep.record.target, 'memory');
  const confirmed = await writeWithVerify({
    record: prep.record,
    existsByKey: async () => false,
    remember: async () => ({ ok: true }),
    recall: async () => true,
    sleep: async () => {},
  });
  assert.equal(confirmed.status, 'recorded');
  assert.equal(confirmed.confirmed, true);

  const accepted = await writeWithVerify({
    record: prep.record,
    existsByKey: async () => false,
    remember: async () => ({ ok: true }),
    recall: async () => false,
    sleep: async () => {},
  });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.recorded, false);
  assert.equal(accepted.confirmed, false);

  const queued = [];
  const failed = await writeWithVerify({
    record: prep.record,
    existsByKey: async () => false,
    remember: async () => ({ ok: false }),
    recall: async () => true,
    queuePending: (r) => queued.push(r),
    sleep: async () => {},
  });
  assert.equal(failed.status, 'UNCONFIRMED');
  assert.equal(queued.length, 1);

  const knowledge = await writeWithVerify({
    record: { ...prep.record, target: 'knowledge' },
    existsByKey: async () => false,
    remember: async () => ({ ok: true }),
    recall: async () => false,
    queuePending: (r) => queued.push(r),
    sleep: async () => {},
  });
  assert.equal(knowledge.status, 'UNCONFIRMED');

  const dup = await writeWithVerify({
    record: prep.record,
    existsByKey: async () => true,
    remember: async () => ({ ok: true }),
    recall: async () => true,
  });
  assert.equal(dup.status, 'duplicate');
});

test('first-miss then hit recall becomes recorded', async () => {
  const prep = prepareWrite({
    content: 'report: retry',
    task: 't',
    agent: 'pi',
    date: '2026-09-16',
    cwd: '/tmp/demo',
    target: 'knowledge',
  });
  let calls = 0;
  const result = await writeWithVerify({
    record: prep.record,
    existsByKey: async () => false,
    remember: async () => ({ ok: true }),
    recall: async () => {
      calls += 1;
      return calls >= 2;
    },
    sleep: async () => {},
  });
  assert.equal(result.status, 'recorded');
  assert.equal(calls, 2);
});

test('generic credential families are redacted before leftover check', () => {
  const samples = [
    'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'GITLAB_TOKEN=glpat-0123456789abcdefghijkl',
    'NPM_TOKEN=npm_0123456789abcdefghijklmnopqrstuvwxyz',
    'CUSTOM_CREDENTIAL=s3cret-value-without-spaces',
  ];
  for (const sample of samples) {
    const out = redact(sample);
    assert.doesNotMatch(out.text, /wJalr|glpat-|npm_0123|s3cret-value/, sample);
    assert.equal(hasUnredactableSecret(out.text), false, sample);
  }
});

test('unredactable secret blocks prepareWrite', () => {
  const blocked = prepareWrite({ content: '-----BEGIN PRIVATE KEY-----\nMIIB', task: 't', agent: 'pi' });
  assert.equal(blocked.ok, false);
});

test('exact .dev.env values are redacted even with unusual quoting', () => {
  const secrets = loadExactSecretValues({ envText: 'ERP_PROD_CREDENTIAL="s3cret value with spaces"\n' });
  const out = redact('use ERP_PROD_CREDENTIAL = "s3cret value with spaces" in report', { exactValues: secrets });
  assert.doesNotMatch(out.text, /s3cret value with spaces/);
  assert.match(out.text, /\[REDACTED:(?:secret_value|secret_store|credential_field)\]/);
});

test('known token is fully redacted', () => {
  const out = redact('token sk-abcdefghijklmnopqrstuvwxyz012345');
  assert.doesNotMatch(out.text, /sk-abcdefghijklmnopqrstuvwxyz012345/);
});

test('unified Memory status line', () => {
  assert.equal(formatMemoryStatus({ anonymous: true }), 'Memory: skipped — anonymous');
  assert.equal(formatMemoryStatus({ recalled: 2, saved: 1 }), 'Memory: recalled 2; saved 1');
  assert.equal(formatMemoryStatus({ recalled: 0, unconfirmed: 1 }), 'Memory: nothing relevant; UNCONFIRMED');
  assert.equal(formatMemoryStatus({ nothingToSave: true }), 'Memory: nothing relevant; nothing to save');
});

test('every listed mutator is denied at anon >= 1 and covered by the fallback regex', () => {
  const regex = anonMutatorFallbackRegex();
  for (const mut of MEMORY_MUTATORS) {
    assert.equal(isMemoryMutator(mut.server, mut.tool), true, `${mut.server}.${mut.tool} must be listed`);
    assert.equal(evaluateAnonMcpCall(1, mut.server, mut.tool).allowed, false, `${mut.server}.${mut.tool} must be denied`);
    const readSet = mut.server === 'memory' ? ANON_MEMORY_READ_TOOLS : ANON_KNOWLEDGE_READ_TOOLS;
    assert.equal(readSet.has(mut.tool), false, `${mut.server}.${mut.tool} must not be classified as a read tool`);
    for (const alias of [`${mut.server}_${mut.tool}`, ...mut.aliases]) {
      assert.equal(regex.test(alias), true, `${alias} must match fallback regex`);
      assert.equal(fallbackAnonVerdict(1, { tool: alias }).allowed, false, `${alias} fallback must deny`);
    }
  }
});
