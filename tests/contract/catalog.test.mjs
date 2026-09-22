import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { classifyCatalogSection } from '../lib/commands.mjs';
import { profileRoot } from '../lib/profile-root.mjs';

test('/review-airules exists and is classified maintainer', () => {
  const root = profileRoot();
  const promptPath = path.join(root, 'prompts', 'review-airules.md');
  assert.ok(fs.existsSync(promptPath), `${promptPath} missing`);
  const catalog = fs.readFileSync(path.join(root, 'prompts', 'CATALOG.md'), 'utf8');
  const commands = fs.readFileSync(path.join(root, 'prompts', 'commands.md'), 'utf8');
  assert.equal(
    classifyCatalogSection(catalog, 'review-airules'),
    'maintainer',
    'CATALOG.md must list /review-airules under Maintainer',
  );
  assert.equal(
    classifyCatalogSection(catalog, 'session-rotate'),
    'settings',
    'CATALOG.md must list /session-rotate under Settings',
  );
  assert.equal(classifyCatalogSection(catalog, 'wrap'), 'settings');
  assert.equal(classifyCatalogSection(catalog, 'memory-flush'), 'settings');
  assert.equal(classifyCatalogSection(catalog, 'capture-model'), 'settings');
  assert.equal(classifyCatalogSection(catalog, 'theme'), 'settings');
  assert.equal(classifyCatalogSection(catalog, 'init-knowledge'), 'settings');
  assert.match(commands, /review-airules/);
  assert.match(commands, /maintainer/i);
});

test('/init-knowledge exists, is settings, and has no /1c-* alias', () => {
  const root = profileRoot();
  const promptPath = path.join(root, 'prompts', 'init-knowledge.md');
  const aliasPath = path.join(root, 'prompts', '1c-init-knowledge.md');
  assert.ok(fs.existsSync(promptPath), `${promptPath} missing`);
  assert.equal(fs.existsSync(aliasPath), false, `${aliasPath} must not exist`);
  const catalog = fs.readFileSync(path.join(root, 'prompts', 'CATALOG.md'), 'utf8');
  assert.equal(classifyCatalogSection(catalog, 'init-knowledge'), 'settings');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  assert.match(prompt, /ensureProjectKnowledgeLayout/);
  assert.match(prompt, /Do \*\*not\*\* copy the agent/);
  assert.match(prompt, /Do \*\*not\*\* run `bootstrap\.mjs --project`/);
});

test('/update-profile exists, is settings, and has no /1c-* alias', () => {
  const root = profileRoot();
  const promptPath = path.join(root, 'prompts', 'update-profile.md');
  const aliasPath = path.join(root, 'prompts', '1c-update-profile.md');
  assert.ok(fs.existsSync(promptPath), `${promptPath} missing`);
  assert.equal(fs.existsSync(aliasPath), false, `${aliasPath} must not exist`);
  const catalog = fs.readFileSync(path.join(root, 'prompts', 'CATALOG.md'), 'utf8');
  assert.equal(
    classifyCatalogSection(catalog, 'update-profile'),
    'settings',
    'CATALOG.md must list /update-profile under Settings',
  );
  assert.notEqual(classifyCatalogSection(catalog, 'update-profile'), 'everyday');
  assert.notEqual(classifyCatalogSection(catalog, 'update-profile'), 'maintainer');
  const helper = path.join(root, 'scripts', 'update-profile.mjs');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  assert.ok(fs.existsSync(helper), `${helper} missing`);
  assert.equal(
    fs.existsSync(path.join(root, 'tools')),
    false,
    'profile-root tools/ makes Pi warn that custom tools belong in extensions/',
  );
  assert.match(prompt, /scripts\/update-profile\.mjs/);
  assert.doesNotMatch(prompt, /tools\/update-profile\.mjs/);
});

test('/update-pi-cli exists, is settings, and has no /1c-* alias', () => {
  const root = profileRoot();
  const promptPath = path.join(root, 'prompts', 'update-pi-cli.md');
  const aliasPath = path.join(root, 'prompts', '1c-update-pi-cli.md');
  assert.ok(fs.existsSync(promptPath), `${promptPath} missing`);
  assert.equal(fs.existsSync(aliasPath), false, `${aliasPath} must not exist`);
  const catalog = fs.readFileSync(path.join(root, 'prompts', 'CATALOG.md'), 'utf8');
  assert.equal(
    classifyCatalogSection(catalog, 'update-pi-cli'),
    'settings',
    'CATALOG.md must list /update-pi-cli under Settings',
  );
  assert.notEqual(classifyCatalogSection(catalog, 'update-pi-cli'), 'everyday');
  assert.notEqual(classifyCatalogSection(catalog, 'update-pi-cli'), 'maintainer');
  const helper = path.join(root, 'scripts', 'update-pi-cli.mjs');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  assert.ok(fs.existsSync(helper), `${helper} missing`);
  assert.match(prompt, /scripts\/update-pi-cli\.mjs/);
});

