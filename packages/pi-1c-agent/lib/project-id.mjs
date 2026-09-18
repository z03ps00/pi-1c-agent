import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterateCyrillic(value) {
  return String(value ?? '').replace(/[А-Яа-яЁё]/g, (ch) => {
    const mapped = CYRILLIC[ch.toLowerCase()];
    if (mapped == null) return ch;
    return ch === ch.toUpperCase() && mapped.length > 0
      ? mapped[0].toUpperCase() + mapped.slice(1)
      : mapped;
  });
}

/** ASCII slug for URIs and `.pi/1c/project-id`. Non-empty input never becomes `unknown`. */
export function slugProjectId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'unknown';
  const ascii = transliterateCyrillic(raw)
    .toLowerCase()
    .replace(/\.git$/i, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (ascii) return ascii;
  return `p-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 8)}`;
}

export function normalizeProjectId(value) {
  return String(value ?? '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/[\\/]+$/, '')
    .replace(/\s+$/g, '')
    .replace(/^\s+/g, '')
    .toLowerCase();
}

export function normalizeWorkspacePath(cwd) {
  return String(cwd ?? '').replace(/[\\/]+$/, '').trim();
}

export function projectIdFromRemote(remote) {
  const raw = String(remote ?? '').trim();
  if (!raw) return '';
  const ssh = raw.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (ssh) return normalizeProjectId(ssh[1]);
  return normalizeProjectId(path.basename(raw));
}

export function projectIdMarkerPath(cwd) {
  return path.join(normalizeWorkspacePath(cwd), '.pi', '1c', 'project-id');
}

export function readProjectIdMarker(cwd) {
  const root = normalizeWorkspacePath(cwd);
  if (!root) return '';
  const marker = projectIdMarkerPath(cwd);
  try {
    if (!fs.existsSync(marker)) return '';
    return slugProjectId(fs.readFileSync(marker, 'utf8').split(/\r?\n/, 1)[0]);
  } catch {
    return '';
  }
}

/** Write a latin slug once; keep an existing non-empty marker. */
export function writeProjectIdMarker(cwd, projectName) {
  const existing = readProjectIdMarker(cwd);
  const file = projectIdMarkerPath(cwd);
  if (existing && existing !== 'unknown') {
    return { path: file, id: existing, created: false };
  }
  const id = slugProjectId(projectName || path.basename(normalizeWorkspacePath(cwd)));
  if (!id || id === 'unknown') return { path: '', id: '', created: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${id}\n`);
  return { path: file, id, created: true };
}

export function deriveProjectId({ cwd, gitRemote, marker, basename } = {}) {
  const fromRemote = projectIdFromRemote(gitRemote);
  if (fromRemote) return fromRemote;
  const fromMarker = marker != null && String(marker).trim()
    ? slugProjectId(marker)
    : (cwd ? readProjectIdMarker(cwd) : '');
  if (fromMarker && fromMarker !== 'unknown') return fromMarker;
  const base = basename
    || (cwd ? path.basename(normalizeWorkspacePath(cwd)) : '');
  return slugProjectId(base);
}

export function projectScope(projectId) {
  return `project:${deriveProjectId({ basename: projectId })}`;
}
