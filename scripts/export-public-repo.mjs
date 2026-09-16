#!/usr/bin/env node
/**
 * Build a fresh public git repository from the sanitized working tree.
 * Does not touch this clone's remotes or history.
 *
 *   node scripts/export-public-repo.mjs /path/to/pi-1c-agent-public
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { listPublishableFiles } from '../tests/lib/public-scan.mjs';
import { profileRoot } from '../tests/lib/profile-root.mjs';

const src = profileRoot();
const dest = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!dest) {
  console.error('Usage: node scripts/export-public-repo.mjs <destination-dir>');
  process.exit(2);
}
if (path.resolve(dest) === path.resolve(src)) {
  console.error('Destination must not be the private clone');
  process.exit(2);
}

const files = listPublishableFiles(src);
if (files.length === 0) {
  console.error('No publishable files');
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
const destGit = path.join(dest, '.git');
if (fs.existsSync(destGit)) {
  console.error(`${dest} already has a .git directory; pick an empty path`);
  process.exit(2);
}

for (const rel of files) {
  const from = path.join(src, rel);
  if (!fs.existsSync(from) || !fs.statSync(from).isFile()) continue;
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function git(args, extra = {}) {
  const r = spawnSync('git', args, {
    cwd: dest,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: extra.authorName || 'pi-1c-agent',
      GIT_AUTHOR_EMAIL: extra.authorEmail || 'pi-1c-agent@users.noreply.github.com',
      GIT_COMMITTER_NAME: extra.authorName || 'pi-1c-agent',
      GIT_COMMITTER_EMAIL: extra.authorEmail || 'pi-1c-agent@users.noreply.github.com',
    },
    ...extra.spawn,
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

git(['init', '-b', 'main']);
git(['add', '-A']);
git(['commit', '-m', 'Initial public release of the Pi 1C agent profile.\n']);

console.log(`Fresh public repository at ${dest}`);
console.log(`Files: ${files.length}. Remotes: none (add the new public remote here, not on the private clone).`);
console.log(`Next: cd ${JSON.stringify(dest)} && git remote add origin <new-empty-public-url> && git push -u origin main`);
