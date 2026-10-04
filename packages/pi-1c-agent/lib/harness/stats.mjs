const COUNTERS = [
  'structuralCalls',
  'fileReads',
  'broadGreps',
  'fallbacks',
  'knowledgeHits',
  'knowledgeMisses',
  'skillsLoaded',
  'rulesLoaded',
  'reviewFindings',
  'verificationFailures',
];

export function createStats() {
  const stats = { contextPeak: 0, lastPromotionTier: null };
  for (const key of COUNTERS) stats[key] = 0;
  return stats;
}

export function bump(stats, key, amount = 1) {
  if (!stats || !Object.prototype.hasOwnProperty.call(stats, key) || key === 'contextPeak' || key === 'lastPromotionTier') return stats;
  const n = Number(amount);
  stats[key] += Number.isFinite(n) ? n : 1;
  return stats;
}

export function noteContextPeak(stats, percent) {
  const n = Number(percent);
  if (!stats || !Number.isFinite(n)) return stats;
  stats.contextPeak = Math.max(stats.contextPeak || 0, Math.round(n));
  return stats;
}

export function notePromotion(stats, tier) {
  if (!stats) return stats;
  stats.lastPromotionTier = tier;
  return stats;
}

export function formatSessionStats(stats = {}) {
  const n = (key) => Number(stats[key]) || 0;
  return [
    'Session efficiency',
    '',
    `Structural MCP calls: ${n('structuralCalls')}`,
    `File reads:           ${n('fileReads')}`,
    `Broad grep scans:     ${n('broadGreps')}`,
    `Fallbacks:            ${n('fallbacks')}`,
    `Knowledge hits:       ${n('knowledgeHits')}`,
    `Knowledge misses:     ${n('knowledgeMisses')}`,
    `Skills loaded:        ${n('skillsLoaded')}`,
    `Rules loaded:         ${n('rulesLoaded')}`,
    `Context peak:         ${n('contextPeak')}%`,
    `Review findings:      ${n('reviewFindings')}`,
    `Verification failed:  ${n('verificationFailures')}`,
  ].join('\n');
}
