import { noteContextPeak } from './stats.mjs';

export const DEFAULT_CONTEXT_BUDGET = 120_000;

export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}

export function contextCeiling(env = process.env) {
  const n = Number(env?.PI_1C_CONTEXT_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : DEFAULT_CONTEXT_BUDGET;
}

export function createBudget(env = process.env) {
  return {
    ceiling: contextCeiling(env),
    used: 0,
    buckets: {
      kernel: 0,
      project: 0,
      rules: 0,
      knowledge: 0,
      evidence: 0,
      conversation: 0,
      reserve: 0,
      skill: 0,
    },
    items: [],
  };
}

export function contextPercent(budget) {
  if (!budget?.ceiling) return 0;
  return Math.min(100, Math.round((budget.used / budget.ceiling) * 100));
}

export function tryAdmit(budget, item, stats) {
  const id = String(item?.id ?? '');
  if (!budget || !id) return { admitted: false, reason: 'missing id' };
  if (budget.items.some((existing) => existing.id === id)) return { admitted: false, reason: 'duplicate' };
  const tokens = estimateTokens(item.text);
  const bucket = item.bucket || 'evidence';
  const protect = item.protect === true || bucket === 'kernel';
  if (!protect && budget.used + tokens > budget.ceiling) return { admitted: false, reason: 'over-budget' };
  budget.items.push({ id, bucket, tokens });
  budget.used += tokens;
  if (Object.prototype.hasOwnProperty.call(budget.buckets, bucket)) budget.buckets[bucket] += tokens;
  if (stats) noteContextPeak(stats, contextPercent(budget));
  return { admitted: true, tokens };
}

export function rankBySummary(items, query, limit = 3) {
  const tokens = new Set(String(query ?? '').toLowerCase().split(/[^a-z0-9а-яё_.-]+/i).filter((part) => part.length > 2));
  const scored = (items ?? []).map((item) => {
    const hay = `${item.id} ${item.summary ?? ''}`.toLowerCase();
    let score = 0;
    for (const token of tokens) if (hay.includes(token)) score += 1;
    return { item, score };
  }).filter((row) => row.score > 0 || tokens.size === 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, limit)).map((row) => row.item);
}
