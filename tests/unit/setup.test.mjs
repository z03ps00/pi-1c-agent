import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { withTempDir } from '../lib/fsutil.mjs';
import { SDK_REMINDER, inRepoPackageDir } from '../../scripts/update-profile.mjs';
import { copyExampleIfMissing, run } from '../../scripts/setup.mjs';

function writeMinimalProfile(root, { withPackage = true } = {}) {
  fs.mkdirSync(path.join(root, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'rules-1c'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- PI-1C-AGENT:BEGIN -->\noverlay\n');
  fs.writeFileSync(path.join(root, 'prompts', 'CATALOG.md'), '## Settings\n');
  fs.writeFileSync(path.join(root, 'rules-1c', 'README.md'), 'rules\n');
  fs.writeFileSync(
    path.join(root, 'settings.json'),
    `${JSON.stringify({ packages: ['<path-to-pi-1c-agent>', 'npm:pi-cursor-sdk'] }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, 'auth.example.json'), '{"cursor":{"type":"api-key","key":"<PUT-YOUR-CURSOR-API-KEY-HERE>"}}\n');
  fs.writeFileSync(path.join(root, 'trust.example.json'), '{"$HOME/projects":true}\n');
  if (withPackage) {
    fs.mkdirSync(path.join(root, 'packages', 'pi-1c-agent'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages', 'pi-1c-agent', 'package.json'),
      `${JSON.stringify({ name: 'pi-1c-agent', version: '0.6.1' }, null, 2)}\n`,
    );
  }
}

function runSetup(profile) {
  return run({
    env: { PI_CODING_AGENT_DIR: profile },
    loadedRoot: profile,
    cwd: profile,
  });
}

test('copyExampleIfMissing copies once and then no-ops', async () => {
  await withTempDir(async (tmp) => {
    fs.writeFileSync(path.join(tmp, 'auth.example.json'), '{"ok":true}\n');
    const first = copyExampleIfMissing(tmp, 'auth.json', 'auth.example.json');
    assert.equal(first.copied, true);
    assert.equal(fs.readFileSync(path.join(tmp, 'auth.json'), 'utf8'), '{"ok":true}\n');
    fs.writeFileSync(path.join(tmp, 'auth.json'), '{"keep":true}\n');
    const second = copyExampleIfMissing(tmp, 'auth.json', 'auth.example.json');
    assert.equal(second.copied, false);
    assert.equal(second.existed, true);
    assert.equal(fs.readFileSync(path.join(tmp, 'auth.json'), 'utf8'), '{"keep":true}\n');
  });
});

test('setup writes in-repo package path and copies auth/trust examples', async () => {
  await withTempDir(async (tmp) => {
    writeMinimalProfile(tmp);
    const result = runSetup(tmp);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'configured');
    assert.equal(result.packagePath, inRepoPackageDir(tmp));
    assert.equal(result.authCopied, true);
    assert.equal(result.trustCopied, true);
    assert.equal(result.reminder, SDK_REMINDER);
    const settings = JSON.parse(fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8'));
    assert.equal(settings.packages[0], inRepoPackageDir(tmp));
    assert.equal(settings.packages[1], 'npm:pi-cursor-sdk');
    assert.ok(fs.existsSync(path.join(tmp, 'auth.json')));
    assert.ok(fs.existsSync(path.join(tmp, 'trust.json')));
    assert.match(result.lines.join('\n'), /next: \/doctor/);
  });
});

test('setup is idempotent when already pointing at the in-repo package', async () => {
  await withTempDir(async (tmp) => {
    writeMinimalProfile(tmp);
    const first = runSetup(tmp);
    assert.equal(first.action, 'configured');
    const before = fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8');
    const second = runSetup(tmp);
    assert.equal(second.ok, true);
    assert.equal(second.action, 'noop');
    assert.equal(fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8'), before);
  });
});

test('setup keeps an existing custom local package path', async () => {
  await withTempDir(async (tmp) => {
    writeMinimalProfile(tmp);
    const settingsPath = path.join(tmp, 'settings.json');
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ packages: ['/opt/local/pi-1c-agent', 'npm:pi-cursor-sdk'] }, null, 2)}\n`,
    );
    const result = runSetup(tmp);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'kept-existing');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(settings.packages[0], '/opt/local/pi-1c-agent');
  });
});

test('setup fails when the in-repo package is missing', async () => {
  await withTempDir(async (tmp) => {
    writeMinimalProfile(tmp, { withPackage: false });
    const result = runSetup(tmp);
    assert.equal(result.ok, false);
    assert.equal(result.state, 'package-missing');
    const settings = JSON.parse(fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8'));
    assert.equal(settings.packages[0], '<path-to-pi-1c-agent>');
  });
});
