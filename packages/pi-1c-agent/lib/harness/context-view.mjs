import { contextPercent } from './budget.mjs';

export function renderContextView({ budget, loaded = {}, skipped = [], decision = null } = {}) {
  const skills = loaded.skills?.length ? loaded.skills.join(', ') : 'none';
  const rules = loaded.rules?.length ? loaded.rules.join(', ') : 'none';
  const knowledge = loaded.knowledge?.length ? loaded.knowledge.join(', ') : 'none';
  const pending = skipped.length ? skipped.map((item) => `${item.id} (${item.reason})`).join('; ') : 'none';
  const pct = contextPercent(budget);
  return [
    'Context',
    `budget: ${pct}% (${budget?.used ?? 0}/${budget?.ceiling ?? 0} est. tokens)`,
    `kernel: ${budget?.buckets?.kernel ?? 0}`,
    `skills: ${skills}`,
    `rules: ${rules}`,
    `knowledge: ${knowledge}`,
    `unavailable: ${pending}`,
    `source: ${decision?.first || 'unset'}`,
  ].join('\n');
}
