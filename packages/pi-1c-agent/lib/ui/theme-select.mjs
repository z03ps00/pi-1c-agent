export const SHIPPED_THEMES = Object.freeze([
  { name: 'standard', label: 'Standard', description: 'VS Code Dark+ / Dark Modern' },
  { name: 'dracula', label: 'Dracula', description: 'VS Code Dracula' },
]);

export const REQUIRED_COLOR_TOKENS = Object.freeze([
  'accent', 'border', 'borderAccent', 'borderMuted', 'success', 'error', 'warning',
  'muted', 'dim', 'text', 'thinkingText', 'selectedBg', 'userMessageBg', 'userMessageText',
  'customMessageBg', 'customMessageText', 'customMessageLabel', 'toolPendingBg',
  'toolSuccessBg', 'toolErrorBg', 'toolTitle', 'toolOutput', 'mdHeading', 'mdLink',
  'mdLinkUrl', 'mdCode', 'mdCodeBlock', 'mdCodeBlockBorder', 'mdQuote', 'mdQuoteBorder',
  'mdHr', 'mdListBullet', 'toolDiffAdded', 'toolDiffRemoved', 'toolDiffContext',
  'syntaxComment', 'syntaxKeyword', 'syntaxFunction', 'syntaxVariable', 'syntaxString',
  'syntaxNumber', 'syntaxType', 'syntaxOperator', 'syntaxPunctuation', 'thinkingOff',
  'thinkingMinimal', 'thinkingLow', 'thinkingMedium', 'thinkingHigh', 'thinkingXhigh',
  'bashMode',
]);

const RANK = Object.freeze({
  standard: 0,
  dracula: 1,
  dark: 2,
  light: 3,
});

const ALIASES = Object.freeze({
  vscode: 'standard',
  'dark-plus': 'standard',
  'dark-modern': 'standard',
});

export function parseThemeArgs(args) {
  const raw = String(args ?? '').trim();
  if (!raw) return { kind: 'pick' };
  const name = raw.split(/\s+/)[0];
  const key = name.toLowerCase();
  if (key === 'status') return { kind: 'status' };
  if (key === 'list') return { kind: 'list' };
  if (!name || name.includes('/')) return { kind: 'invalid', raw };
  return { kind: 'set', name };
}

export function shippedThemeMeta(name) {
  return SHIPPED_THEMES.find((t) => t.name === String(name || '')) || null;
}

export function describeThemeSource(theme) {
  const shipped = shippedThemeMeta(theme?.name);
  if (shipped) return shipped.description;
  if (!theme?.path) return 'built-in';
  return 'custom';
}

export function currentThemeName(ctx) {
  return String(ctx?.ui?.theme?.name || '').trim();
}

export function listThemes(ctx) {
  const list = typeof ctx?.ui?.getAllThemes === 'function' ? ctx.ui.getAllThemes() : [];
  return Array.isArray(list) ? list.filter((t) => t && t.name) : [];
}

export function themeSelectItems(themes, currentName) {
  const current = String(currentName || '');
  return sortThemes(themes).map((t) => ({
    value: t.name,
    label: t.name === current ? `${t.name}  (current)` : t.name,
    description: describeThemeSource(t),
  }));
}

export function sortThemes(themes) {
  return [...(themes || [])].sort((a, b) => {
    const ra = RANK[a.name] ?? 10;
    const rb = RANK[b.name] ?? 10;
    return ra - rb || String(a.name).localeCompare(String(b.name));
  });
}

export function formatThemeList(themes, currentName) {
  const current = String(currentName || '');
  const rows = sortThemes(themes).map((t) => {
    const mark = t.name === current ? '*' : ' ';
    return `${mark} ${t.name.padEnd(12)} ${describeThemeSource(t)}`;
  });
  if (!rows.length) {
    return 'No themes discovered. Built-in: dark, light. Package: standard, dracula.';
  }
  const currentLine = current ? `Current: ${current}` : 'Current: (unknown)';
  return [currentLine, '', ...rows].join('\n');
}

export function resolveThemeName(requested, themes) {
  const raw = String(requested || '').trim();
  if (!raw) return raw;
  const aliased = ALIASES[raw.toLowerCase()] || raw;
  const list = Array.isArray(themes) ? themes : [];
  const exact = list.find((t) => t.name === aliased);
  if (exact) return exact.name;
  const lower = aliased.toLowerCase();
  const ci = list.find((t) => String(t.name).toLowerCase() === lower);
  if (ci) return ci.name;
  const shipped = SHIPPED_THEMES.find((t) => t.name === lower);
  return shipped ? shipped.name : aliased;
}

export function applyTheme(ctx, name) {
  if (typeof ctx?.ui?.setTheme !== 'function') {
    return { success: false, error: 'Theme switching needs the Pi TUI' };
  }
  const result = ctx.ui.setTheme(name);
  if (result && typeof result === 'object') return result;
  return { success: true };
}
