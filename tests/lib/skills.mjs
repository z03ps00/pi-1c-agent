export function readSkillFrontmatter(md) {
  if (!md) return {};
  const m = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const raw = kv[2];
      if (raw === '>' || raw === '|') out[key] = '';
      else out[key] = raw.replace(/^["']|["']$/g, '');
    } else if (key && /^\s+\S/.test(line)) {
      out[key] = `${out[key] ? `${out[key]} ` : ''}${line.trim()}`;
    }
  }
  return out;
}

/**
 * Read the shipped CAVEMAN default from files that bake it in.
 * Returns `auto` when every baking file agrees; otherwise the conflicting set.
 */
export function readCavemanDefault(files) {
  const entries = Array.isArray(files)
    ? files.map((f, i) => [f.path ?? String(i), f.content ?? f.text ?? String(f)])
    : Object.entries(files ?? {});
  const values = [];
  for (const [, text] of entries) {
    const src = String(text);
    if (!/shipped default/i.test(src)) continue;
    if (/shipped default[^.\n]{0,80}\bauto\b|\bauto\b[^.\n]{0,80}shipped default|CAVEMAN=auto[^.\n]{0,40}shipped default/i.test(src)) {
      values.push('auto');
    } else if (/shipped default[^.\n]{0,80}\bon\b|\bon\b[^.\n]{0,40}shipped default/i.test(src)) {
      values.push('on');
    } else if (/shipped default[^.\n]{0,80}\boff\b/.test(src)) {
      values.push('off');
    }
  }
  const unique = [...new Set(values)];
  if (unique.length === 1) return unique[0];
  if (unique.length === 0) return null;
  return unique;
}
