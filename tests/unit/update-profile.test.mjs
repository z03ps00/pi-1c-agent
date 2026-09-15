import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { withTempDir } from '../lib/fsutil.mjs';
import {
  SDK_REMINDER,
  isLocalPi1cAgentPath,
  isProfileRoot,
  parseArgs,
  parsePorcelain,
  redactRemoteUrl,
  resolveProfileRoot,
  restoreMcpServers,
  restorePi1cAgentPath,
  run,
} from '../../tools/update-profile.mjs';

function git(cwd, args) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return r;
}

function writeMinimalProfile(root) {
  fs.mkdirSync(path.join(root, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'rules-1c'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- PI-1C-AGENT:BEGIN -->\noverlay\n');
  fs.writeFileSync(path.join(root, 'prompts', 'CATALOG.md'), '## Settings\n');
  fs.writeFileSync(path.join(root, 'rules-1c', 'README.md'), 'rules\n');
  fs.writeFileSync(
    path.join(root, 'mcp.json'),
    `${JSON.stringify({ settings: { notifyOnStartupConnect: false }, mcpServers: {} }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, 'settings.json'),
    `${JSON.stringify({ packages: ['<path-to-pi-1c-agent>', 'npm:pi-cursor-sdk'] }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, 'README.md'), 'profile\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'auth.json\ntrust.json\nnpm/\n');
}

function initRepo(dir) {
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}

function fileSha(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function withProfileClone(fn) {
  return withTempDir(async (tmp) => {
    const upstream = path.join(tmp, 'upstream');
    const profile = path.join(tmp, 'profile');
    const project = path.join(tmp, 'project');
    fs.mkdirSync(upstream);
    writeMinimalProfile(upstream);
    initRepo(upstream);
    git(upstream, ['add', '-A']);
    git(upstream, ['commit', '-m', 'seed']);
    git(tmp, ['clone', upstream, profile]);
    git(profile, ['config', 'user.email', 'test@example.com']);
    git(profile, ['config', 'user.name', 'Test']);
    git(profile, ['config', 'commit.gpgsign', 'false']);
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, '.ai-rules.json'), '{}\n');
    fs.writeFileSync(path.join(project, 'project.env'), 'IB_PASSWORD=secret\n');
    return fn({ tmp, upstream, profile, project });
  });
}

function runOn(profile, extra = {}) {
  return run({
    env: { PI_CODING_AGENT_DIR: profile },
    loadedRoot: profile,
    cwd: extra.cwd ?? profile,
    argv: extra.argv ?? [],
    gitBin: extra.gitBin,
  });
}

function publishUpstream(upstream, rel, contents) {
  fs.writeFileSync(path.join(upstream, rel), contents);
  git(upstream, ['add', rel]);
  git(upstream, ['commit', '-m', 'remote change']);
}

test('redactRemoteUrl strips userinfo', () => {
  assert.equal(
    redactRemoteUrl('https://user:s3cret-token@github.com/org/repo.git'),
    'https://github.com/org/repo.git',
  );
  assert.equal(redactRemoteUrl('https://github.com/org/repo.git'), 'https://github.com/org/repo.git');
});

test('parsePorcelain keeps the leading porcelain space', () => {
  assert.deepEqual(parsePorcelain(' M AGENTS.md\n'), { tracked: ['AGENTS.md'], untracked: [] });
  assert.deepEqual(parsePorcelain('?? npm/keep.txt\n'), { tracked: [], untracked: ['npm/keep.txt'] });
});

test('parseArgs: status, force, ref', () => {
  assert.deepEqual(parseArgs([]), { mode: 'update', ref: null });
  assert.deepEqual(parseArgs(['status']), { mode: 'status', ref: null });
  assert.deepEqual(parseArgs(['check']), { mode: 'status', ref: null });
  assert.deepEqual(parseArgs(['force', 'main']), { mode: 'force', ref: 'main' });
  assert.deepEqual(parseArgs(['overwrite']), { mode: 'force', ref: null });
  assert.deepEqual(parseArgs(['v1.2.3']), { mode: 'update', ref: 'v1.2.3' });
});

test('restoreMcpServers keeps extras missing from incoming default', () => {
  const out = restoreMcpServers(
    { mcpServers: { memory: { url: 'http://example.invalid/memory' } } },
    { mcpServers: {} },
  );
  assert.equal(out.mcpServers.memory.url, 'http://example.invalid/memory');
});

test('restorePi1cAgentPath keeps local filesystem path', () => {
  assert.equal(isLocalPi1cAgentPath('/opt/local/pi-1c-agent'), true);
  assert.equal(isLocalPi1cAgentPath('<path-to-pi-1c-agent>'), false);
  const out = restorePi1cAgentPath(
    { packages: ['/opt/local/pi-1c-agent', 'npm:pi-cursor-sdk'] },
    { packages: ['<path-to-pi-1c-agent>', 'npm:pi-cursor-sdk'] },
  );
  assert.equal(out.packages[0], '/opt/local/pi-1c-agent');
});

test('resolveProfileRoot prefers PI_CODING_AGENT_DIR over project cwd', async () => {
  await withProfileClone(async ({ profile, project }) => {
    assert.equal(isProfileRoot(profile), true);
    assert.equal(isProfileRoot(project), false);
    const resolved = resolveProfileRoot({
      env: { PI_CODING_AGENT_DIR: profile },
      cwd: project,
      loadedRoot: profile,
    });
    assert.equal(resolved, path.resolve(profile));
  });
});

test('missing git is a hard stop with copy-paste', async () => {
  await withProfileClone(async ({ profile }) => {
    const result = runOn(profile, { gitBin: path.join(profile, 'no-such-git-binary') });
    assert.equal(result.ok, false);
    assert.equal(result.state, 'no-git');
    assert.ok(result.copyPaste.length > 0);
    assert.match(result.lines.join('\n'), /git -C "\$PI_CODING_AGENT_DIR" fetch origin/);
  });
});

test('status does not write working-tree files', async () => {
  await withProfileClone(async ({ profile }) => {
    const auth = path.join(profile, 'auth.json');
    fs.writeFileSync(auth, '{"cursor":"secret-token-do-not-print"}\n');
    const before = {
      agents: fileSha(path.join(profile, 'AGENTS.md')),
      mcp: fileSha(path.join(profile, 'mcp.json')),
      auth: fileSha(auth),
    };
    const result = runOn(profile, { argv: ['status'] });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'status');
    assert.equal(fileSha(path.join(profile, 'AGENTS.md')), before.agents);
    assert.equal(fileSha(path.join(profile, 'mcp.json')), before.mcp);
    assert.equal(fileSha(auth), before.auth);
  });
});

test('dirty tracked files other than mcp/settings are refused', async () => {
  await withProfileClone(async ({ profile, upstream }) => {
    publishUpstream(upstream, 'NEW.txt', 'from-remote\n');
    fs.appendFileSync(path.join(profile, 'AGENTS.md'), 'local-edit\n');
    const before = fs.readFileSync(path.join(profile, 'AGENTS.md'), 'utf8');
    const result = runOn(profile);
    assert.equal(result.ok, false);
    assert.equal(result.action, 'refused');
    assert.equal(result.state, 'dirty');
    assert.ok(result.dirtyPaths.includes('AGENTS.md'));
    assert.equal(fs.readFileSync(path.join(profile, 'AGENTS.md'), 'utf8'), before);
    assert.equal(fs.existsSync(path.join(profile, 'NEW.txt')), false);
  });
});

test('fast-forward update keeps secrets, extras, local package path, npm dir', async () => {
  await withProfileClone(async ({ profile, project, upstream }) => {
    const auth = path.join(profile, 'auth.json');
    const trust = path.join(profile, 'trust.json');
    fs.writeFileSync(auth, '{"cursor":"secret-token-do-not-print"}\n');
    fs.writeFileSync(trust, '{"projects":[]}\n');
    const npmFile = path.join(profile, 'npm', 'keep.txt');
    fs.mkdirSync(path.join(profile, 'npm'), { recursive: true });
    fs.writeFileSync(npmFile, 'keep-npm\n');
    const mcp = JSON.parse(fs.readFileSync(path.join(profile, 'mcp.json'), 'utf8'));
    mcp.mcpServers.memory = { url: 'http://example.invalid/memory' };
    fs.writeFileSync(path.join(profile, 'mcp.json'), `${JSON.stringify(mcp, null, 2)}\n`);
    const settings = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
    settings.packages = ['/opt/local/pi-1c-agent', 'npm:pi-cursor-sdk'];
    fs.writeFileSync(path.join(profile, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`);
    const authSha = fileSha(auth);
    const trustSha = fileSha(trust);
    const npmSha = fileSha(npmFile);
    const envBefore = fs.readFileSync(path.join(project, 'project.env'), 'utf8');
    publishUpstream(upstream, 'NEW.txt', 'from-remote\n');
    const result = runOn(profile, { cwd: project });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'updated');
    assert.equal(fs.readFileSync(path.join(profile, 'NEW.txt'), 'utf8'), 'from-remote\n');
    assert.equal(fileSha(auth), authSha);
    assert.equal(fileSha(trust), trustSha);
    assert.equal(fileSha(npmFile), npmSha);
    const afterMcp = JSON.parse(fs.readFileSync(path.join(profile, 'mcp.json'), 'utf8'));
    assert.equal(afterMcp.mcpServers.memory.url, 'http://example.invalid/memory');
    const afterSettings = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
    assert.equal(afterSettings.packages[0], '/opt/local/pi-1c-agent');
    assert.equal(fs.readFileSync(path.join(project, 'project.env'), 'utf8'), envBefore);
    assert.equal(result.reminder, SDK_REMINDER);
    assert.ok(result.oldSha);
    assert.ok(result.newSha);
    assert.notEqual(result.oldSha, result.newSha);
    assert.doesNotMatch(result.lines.join('\n'), /secret-token-do-not-print/);
  });
});

test('already current is a no-op success', async () => {
  await withProfileClone(async ({ profile }) => {
    const before = fileSha(path.join(profile, 'AGENTS.md'));
    const result = runOn(profile);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'noop');
    assert.equal(result.state, 'current');
    assert.equal(fileSha(path.join(profile, 'AGENTS.md')), before);
  });
});
