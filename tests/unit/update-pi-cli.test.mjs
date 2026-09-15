import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { withTempDir } from '../lib/fsutil.mjs';
import {
  PI_CLI_PACKAGE,
  compareSemver,
  findPrefixFromPackagePath,
  getCurrentVersion,
  hostCopyPaste,
  parseArgs,
  resolveExecutableChain,
  resolveNpmPrefix,
  run,
  snapshotProfileConfigs,
  verifyAndRestoreConfigs,
} from '../../scripts/update-pi-cli.mjs';

function fileSha(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('parseArgs: defaults, status, force, version, custom prefix', () => {
  assert.deepEqual(parseArgs([]), { mode: 'update', targetVersion: null, customPrefix: null });
  assert.deepEqual(parseArgs(['status']), { mode: 'status', targetVersion: null, customPrefix: null });
  assert.deepEqual(parseArgs(['check']), { mode: 'status', targetVersion: null, customPrefix: null });
  assert.deepEqual(parseArgs(['force']), { mode: 'force', targetVersion: null, customPrefix: null });
  assert.deepEqual(parseArgs(['overwrite']), { mode: 'force', targetVersion: null, customPrefix: null });
  assert.deepEqual(parseArgs(['0.86.0']), { mode: 'update', targetVersion: '0.86.0', customPrefix: null });
  assert.deepEqual(parseArgs(['force', '0.86.0']), { mode: 'force', targetVersion: '0.86.0', customPrefix: null });
  assert.deepEqual(parseArgs(['--prefix=/opt/pi', 'status']), {
    mode: 'status',
    targetVersion: null,
    customPrefix: '/opt/pi',
  });
  assert.deepEqual(parseArgs(['--prefix=/opt/pi', 'force', '0.86.0']), {
    mode: 'force',
    targetVersion: '0.86.0',
    customPrefix: '/opt/pi',
  });
});

test('compareSemver: standard, patch, minor, major, v-prefix', () => {
  assert.equal(compareSemver('0.85.1', '0.85.1'), 0);
  assert.equal(compareSemver('0.85.1', '0.86.0'), -1);
  assert.equal(compareSemver('0.86.0', '0.85.1'), 1);
  assert.equal(compareSemver('v0.85.1', '0.85.1'), 0);
  assert.equal(compareSemver('0.85.2', '0.85.10'), -1);
  assert.equal(compareSemver('1.0.0', '0.99.9'), 1);
  assert.equal(compareSemver('0.85.1-beta', '0.85.1'), 0);
  assert.equal(compareSemver(null, '0.85.1'), 0);
  assert.equal(compareSemver('0.85.1', null), 0);
});

test('findPrefixFromPackagePath: resolves Unix and Windows layouts', () => {
  assert.equal(
    findPrefixFromPackagePath(
      '/mnt/vol_328/Pi/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
    ),
    '/mnt/vol_328/Pi',
  );
  assert.equal(
    findPrefixFromPackagePath(
      'C:\\Users\\app\\AppData\\Roaming\\npm\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\bundle\\cli.js',
    ),
    'C:/Users/app/AppData/Roaming/npm',
  );
  assert.equal(
    findPrefixFromPackagePath(
      '/opt/custom/node_modules/@earendil-works/pi-coding-agent/package.json',
    ),
    '/opt/custom',
  );
  assert.equal(findPrefixFromPackagePath('/usr/bin/other-tool'), null);
});

test('resolveNpmPrefix: customPrefix and env override', () => {
  assert.equal(resolveNpmPrefix({ customPrefix: '/my/custom' }), path.resolve('/my/custom'));
  assert.equal(
    resolveNpmPrefix({ env: { PI_UPDATE_PREFIX: '/env/prefix' } }),
    path.resolve('/env/prefix'),
  );
});

test('resolveNpmPrefix: resolves via wrapper script and PI_BIN', async () => {
  await withTempDir(async (tmp) => {
    const fakePrefix = path.join(tmp, 'Pi');
    const binDir = path.join(fakePrefix, 'bin');
    const pkgDir = path.join(
      fakePrefix,
      'lib',
      'node_modules',
      '@earendil-works',
      'pi-coding-agent',
    );
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"@earendil-works/pi-coding-agent","version":"0.85.1"}\n');

    const realBin = path.join(binDir, 'pi');
    fs.writeFileSync(realBin, '#!/bin/sh\nexit 0\n');

    const wrapperDir = path.join(tmp, 'wrapper');
    fs.mkdirSync(wrapperDir, { recursive: true });
    const wrapperBin = path.join(wrapperDir, 'pi-launch.sh');
    fs.writeFileSync(wrapperBin, `#!/bin/bash\nPI_BIN="${realBin}"\nexec "$PI_BIN" "$@"\n`);

    const prefix = resolveNpmPrefix({ piBin: wrapperBin });
    assert.equal(prefix, path.resolve(fakePrefix));
  });
});

test('getCurrentVersion: extracts from lib or direct node_modules', async () => {
  await withTempDir(async (tmp) => {
    const libPkg = path.join(tmp, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent');
    fs.mkdirSync(libPkg, { recursive: true });
    fs.writeFileSync(path.join(libPkg, 'package.json'), '{"version":"0.85.1"}\n');
    assert.equal(getCurrentVersion(tmp), '0.85.1');
  });

  await withTempDir(async (tmp) => {
    const directPkg = path.join(tmp, 'node_modules', '@earendil-works', 'pi-coding-agent');
    fs.mkdirSync(directPkg, { recursive: true });
    fs.writeFileSync(path.join(directPkg, 'package.json'), '{"version":"0.86.3"}\n');
    assert.equal(getCurrentVersion(tmp), '0.86.3');
  });

  await withTempDir(async (tmp) => {
    assert.equal(getCurrentVersion(tmp), null);
  });
});

test('snapshotProfileConfigs and verifyAndRestoreConfigs: protects settings and secrets', async () => {
  await withTempDir(async (tmp) => {
    const profile = path.join(tmp, 'profile');
    const prefix = path.join(tmp, 'prefix');
    const config1c = path.join(prefix, 'config-1c');
    const sessions = path.join(prefix, 'sessions');

    fs.mkdirSync(profile, { recursive: true });
    fs.mkdirSync(config1c, { recursive: true });
    fs.mkdirSync(sessions, { recursive: true });

    const originalSettings = {
      packages: ['/local/pi-1c-agent', 'npm:pi-cursor-sdk'],
      defaultProvider: 'deepseek',
      defaultModel: 'deepseek-v4-flash',
      defaultThinkingLevel: 'high',
      theme: 'dark',
      enableSkillCommands: false,
    };
    const settingsPath = path.join(profile, 'settings.json');
    fs.writeFileSync(settingsPath, `${JSON.stringify(originalSettings, null, 2)}\n`);

    const mcpPath = path.join(profile, 'mcp.json');
    fs.writeFileSync(mcpPath, '{"mcpServers":{"myMcp":{"url":"http://127.0.0.1:8000"}}}\n');

    const authPath = path.join(profile, 'auth.json');
    fs.writeFileSync(authPath, '{"cursor":"secret-api-key"}\n');

    const trustPath = path.join(profile, 'trust.json');
    fs.writeFileSync(trustPath, '{"projects":["/trusted/path"]}\n');

    const config1cSettings = path.join(config1c, 'settings.json');
    fs.writeFileSync(config1cSettings, '{"theme":"light","packages":["local"]}\n');

    const snapshot = snapshotProfileConfigs({ profileDir: profile, prefixDir: prefix });
    assert.ok(snapshot.files.has(settingsPath));
    assert.ok(snapshot.files.has(mcpPath));
    assert.ok(snapshot.files.has(authPath));
    assert.ok(snapshot.files.has(trustPath));
    assert.ok(snapshot.files.has(config1cSettings));
    assert.ok(snapshot.prefixDirs.includes('config-1c'));
    assert.ok(snapshot.prefixDirs.includes('sessions'));

    // 1. Simulate an update tool rewriting settings.json with defaults
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        lastChangelogVersion: '0.86.0',
        defaultProvider: 'anthropic',
        packages: ['<path-to-pi-1c-agent>'],
      }),
    );
    // Delete auth.json
    fs.unlinkSync(authPath);
    // Overwrite mcp.json
    fs.writeFileSync(mcpPath, '{"mcpServers":{}}\n');

    const summary = verifyAndRestoreConfigs(snapshot, { prefixDir: prefix });
    assert.ok(summary.restored.includes('settings.json'));
    assert.ok(summary.restored.includes('auth.json'));
    assert.ok(summary.restored.includes('mcp.json'));

    // Check restored content
    const restoredSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.deepEqual(restoredSettings.packages, originalSettings.packages);
    assert.equal(restoredSettings.defaultProvider, 'deepseek');
    assert.equal(restoredSettings.defaultModel, 'deepseek-v4-flash');
    assert.equal(restoredSettings.enableSkillCommands, false);
    // Notice: lastChangelogVersion is accepted/updated
    assert.equal(restoredSettings.lastChangelogVersion, '0.86.0');

    // Check auth.json restored
    assert.ok(fs.existsSync(authPath));
    assert.equal(fs.readFileSync(authPath, 'utf8'), '{"cursor":"secret-api-key"}\n');

    // Check mcp.json restored
    const restoredMcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    assert.ok(restoredMcp.mcpServers.myMcp);
  });
});

test('snapshotProfileConfigs and verifyAndRestoreConfigs: accepts lastChangelogVersion bump without restoring', async () => {
  await withTempDir(async (tmp) => {
    const profile = path.join(tmp, 'profile');
    fs.mkdirSync(profile, { recursive: true });

    const originalSettings = {
      lastChangelogVersion: '0.85.1',
      defaultModel: 'deepseek-v4-flash',
    };
    const settingsPath = path.join(profile, 'settings.json');
    fs.writeFileSync(settingsPath, `${JSON.stringify(originalSettings, null, 2)}\n`);

    const snapshot = snapshotProfileConfigs({ profileDir: profile, prefixDir: null });

    // Simulate Pi updating lastChangelogVersion only
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ lastChangelogVersion: '0.86.0', defaultModel: 'deepseek-v4-flash' }, null, 2)}\n`,
    );

    const summary = verifyAndRestoreConfigs(snapshot, { prefixDir: null });
    assert.equal(summary.restored.length, 0);
    assert.ok(summary.intact.includes('settings.json'));
  });
});

test('run: status reports current or behind correctly', async () => {
  await withTempDir(async (tmp) => {
    const fakePrefix = path.join(tmp, 'Pi');
    const pkgDir = path.join(fakePrefix, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"version":"0.85.1"}\n');

    // Case 1: current === target
    const resCurrent = run({
      customPrefix: fakePrefix,
      argv: ['status'],
      latestVersion: '0.85.1',
    });
    assert.equal(resCurrent.ok, true);
    assert.equal(resCurrent.action, 'status');
    assert.equal(resCurrent.state, 'current');
    assert.match(resCurrent.message, /up to date/);

    // Case 2: current < target (behind)
    const resBehind = run({
      customPrefix: fakePrefix,
      argv: ['status'],
      latestVersion: '0.86.0',
    });
    assert.equal(resBehind.ok, true);
    assert.equal(resBehind.action, 'status');
    assert.equal(resBehind.state, 'behind');
    assert.match(resBehind.message, /behind/);
  });
});

test('run: noop when already current without force', async () => {
  await withTempDir(async (tmp) => {
    const fakePrefix = path.join(tmp, 'Pi');
    const pkgDir = path.join(fakePrefix, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"version":"0.85.1"}\n');

    let ranInstall = false;
    const res = run({
      customPrefix: fakePrefix,
      argv: [],
      latestVersion: '0.85.1',
      installRunner: () => {
        ranInstall = true;
        return { ok: true };
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.action, 'noop');
    assert.equal(res.state, 'current');
    assert.equal(ranInstall, false);
  });
});

test('run: executes installRunner when behind, preserving configs', async () => {
  await withTempDir(async (tmp) => {
    const fakePrefix = path.join(tmp, 'Pi');
    const profile = path.join(tmp, 'profile');
    const pkgDir = path.join(fakePrefix, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"version":"0.85.1"}\n');

    const settingsPath = path.join(profile, 'settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ defaultModel: 'deepseek-v4-flash', packages: ['/local/pkg'] }),
    );

    let installArgs = null;
    const res = run({
      customPrefix: fakePrefix,
      argv: ['0.86.0'],
      env: { PI_CODING_AGENT_DIR: profile },
      loadedRoot: profile,
      latestVersion: '0.86.0',
      newVersion: '0.86.0',
      installRunner: (args) => {
        installArgs = args;
        // Simulate installer modifying settings.json
        fs.writeFileSync(settingsPath, JSON.stringify({ defaultModel: 'anthropic', packages: [] }));
        return { ok: true };
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.action, 'updated');
    assert.equal(res.targetVersion, '0.86.0');
    assert.equal(installArgs.targetVersion, '0.86.0');
    assert.equal(installArgs.prefixDir, fakePrefix);

    // Assert settings.json was restored
    const restored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(restored.defaultModel, 'deepseek-v4-flash');
    assert.deepEqual(restored.packages, ['/local/pkg']);
  });
});

test('run: handles installRunner failure gracefully', async () => {
  await withTempDir(async (tmp) => {
    const fakePrefix = path.join(tmp, 'Pi');
    const pkgDir = path.join(fakePrefix, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{"version":"0.85.1"}\n');

    const res = run({
      customPrefix: fakePrefix,
      argv: ['0.86.0'],
      installRunner: () => ({ ok: false, err: 'npm network timeout' }),
    });

    assert.equal(res.ok, false);
    assert.equal(res.action, 'error');
    assert.equal(res.state, 'install-failed');
    assert.match(res.message, /npm network timeout/);
    assert.ok(res.copyPaste.length > 0);
  });
});

test('run: unknown prefix is a clean stop with host copy-paste', () => {
  const res = run({
    piBin: '/non/existent/bin/pi',
    env: { PI_UPDATE_PREFIX: '' },
    whichBin: '/non/existent/which',
  });
  assert.equal(res.ok, false);
  assert.equal(res.state, 'unknown-prefix');
  assert.ok(res.copyPaste.length > 0);
});
