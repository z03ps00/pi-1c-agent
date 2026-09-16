import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileRoot } from '../lib/profile-root.mjs';

test('NOTICE exists and separates upstream from overlay', () => {
  const noticePath = path.join(profileRoot(), 'NOTICE');
  assert.ok(fs.existsSync(noticePath), 'NOTICE missing');
  const text = fs.readFileSync(noticePath, 'utf8');
  assert.match(text, /comol\/ai_rules_1c/);
  assert.match(text, /overlay/i);
  assert.match(text, /upstream/i);
});

test('settings.json uses <path-to-pi-1c-agent> placeholder', () => {
  const settingsPath = path.join(profileRoot(), 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const packages = settings.packages || [];
  assert.ok(
    packages.includes('<path-to-pi-1c-agent>'),
    `${settingsPath} must list <path-to-pi-1c-agent>, got ${JSON.stringify(packages)}`,
  );
  assert.ok(
    !packages.some((p) => /\/home\/|\/mnt\/vol_|[CD]:[\\/]/i.test(String(p))),
    `${settingsPath} packages must not contain a machine path`,
  );
});

test('settings.json does not register skills as slash commands', () => {
  const settingsPath = path.join(profileRoot(), 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(
    settings.enableSkillCommands,
    false,
    `${settingsPath} must set enableSkillCommands false so / lists prompts, not /skill:*`,
  );
});

test('settings.json lists unpinned npm:pi-cursor-sdk', () => {
  const settingsPath = path.join(profileRoot(), 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const packages = settings.packages || [];
  assert.ok(
    packages.includes('npm:pi-cursor-sdk'),
    `${settingsPath} must list unpinned npm:pi-cursor-sdk, got ${JSON.stringify(packages)}`,
  );
  assert.ok(
    !packages.some((p) => String(p).startsWith('npm:pi-cursor-sdk@')),
    `${settingsPath} must not pin pi-cursor-sdk, got ${JSON.stringify(packages)}`,
  );
});

test('settings.json lists unpinned npm:pi-tool-display', () => {
  const settingsPath = path.join(profileRoot(), 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const packages = settings.packages || [];
  assert.ok(
    packages.includes('npm:pi-tool-display'),
    `${settingsPath} must list unpinned npm:pi-tool-display, got ${JSON.stringify(packages)}`,
  );
  assert.ok(
    !packages.some((p) => String(p).startsWith('npm:pi-tool-display@')),
    `${settingsPath} must not pin pi-tool-display, got ${JSON.stringify(packages)}`,
  );
});

test('packages/pi-1c-agent ships with expected extensions', () => {
  const pkgRoot = path.join(profileRoot(), 'packages', 'pi-1c-agent');
  const pkgPath = path.join(pkgRoot, 'package.json');
  assert.ok(fs.existsSync(pkgPath), `${pkgPath} missing — clone must include the runtime package`);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.name, 'pi-1c-agent');
  const extensions = pkg.pi?.extensions || [];
  const required = [
    'extensions/1c-mode/index.ts',
    'extensions/1c-init/index.ts',
    'extensions/1c-admin/index.ts',
    'extensions/1c-session-rotate/index.ts',
    'extensions/1c-memory/index.ts',
  ];
  for (const rel of required) {
    assert.ok(extensions.includes(rel), `${pkgPath} must register ${rel}, got ${JSON.stringify(extensions)}`);
    assert.ok(fs.existsSync(path.join(pkgRoot, rel)), `${path.join(pkgRoot, rel)} missing`);
  }
});
