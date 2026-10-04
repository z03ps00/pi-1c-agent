import fs from 'node:fs';
import path from 'node:path';
import { parseWorkflowYaml, validateWorkflow } from '../workflows.mjs';

export const TIER_WORKFLOWS = Object.freeze({
  1: 'tier1',
  2: 'tier2',
  3: 'tier3',
  4: 'tier4',
});

const RISK = [
  { re: /метаданн|реквизит|форм[аыу]|подписк/i, tier: 3, reason: 'metadata' },
  { re: /жив(ой|ая|ую)\s+(иб|баз)|live ib|infobase/i, tier: 3, reason: 'live-ib' },
  { re: /миграц/i, tier: 4, reason: 'migration' },
  { re: /(?<![0-9A-Za-zА-Яа-яЁё_])обмен(?![0-9A-Za-zА-Яа-яЁё_])/i, tier: 4, reason: 'exchange' },
  { re: /\bправ[ао]\b|роли\b|роль\b/i, tier: 3, reason: 'rights' },
  { re: /производительн/i, tier: 3, reason: 'performance' },
  { re: /продакш|в прод\b|production/i, tier: 4, reason: 'production' },
  { re: /незнаком/i, tier: 3, reason: 'unfamiliar' },
  { re: /нет тестов|без тестов/i, tier: 3, reason: 'no-tests' },
  { re: /неопредел[её]н/i, tier: 3, reason: 'uncertainty' },
];

function baseTier(text) {
  const lower = String(text ?? '');
  if (/(исправ|поправ|fix|edit|добав|измен|создай|рефактор)/i.test(lower)) {
    if (/(одн[ау]|маленьк|локальн|one procedure|одну процедуру)/i.test(lower) || /module\.bsl/i.test(lower)) return 1;
    return 2;
  }
  if (/(как|что|где|почему|how|where|what)\b/i.test(lower)) return 0;
  return 0;
}

export function selectTier(task, { userRequestsReview = false } = {}) {
  const text = String(task ?? '');
  const reasons = [];
  let tier = baseTier(text);
  const asksForReview = userRequestsReview || /architecture review|архитектурн(?:ый|ого|ом)?\s+разбор|независим(?:ый|ая)\s+провер/i.test(text);
  if (tier === 0 && !asksForReview) {
    return {
      tier: 0,
      workflow: null,
      reasons,
      syntaxCheckRequired: false,
      replacesMode: false,
      summary: 'Tier 0: orchestrator only. No subagents.',
    };
  }
  for (const rule of RISK) {
    if (rule.re.test(text) && rule.tier > tier) {
      tier = rule.tier;
      reasons.push(rule.reason);
    } else if (rule.re.test(text)) reasons.push(rule.reason);
  }
  const wide = asksForReview;
  if (wide && tier < 3) {
    tier = /verifier|независим/i.test(text) ? 4 : 3;
    reasons.push('user-review');
  } else if (/verifier|независим(ый|ая)\s+verifier/i.test(text)) {
    tier = Math.max(tier, 4);
    reasons.push('user-review');
  }
  const codeChange = tier >= 1 && /(bsl|процедур|модул|исправ|fix|edit)/i.test(text);
  return {
    tier,
    workflow: TIER_WORKFLOWS[tier] ?? null,
    reasons,
    syntaxCheckRequired: codeChange,
    replacesMode: false,
    summary: tier === 0
      ? 'Tier 0: orchestrator only. No subagents.'
      : `Tier ${tier}: workflow ${TIER_WORKFLOWS[tier]}.`,
  };
}

export function tierWorkflowText(tier) {
  if (tier === 1) return 'name: tier1\nstages:\n  - 1c-developer\n  - verification\n';
  if (tier === 2) return 'name: tier2\nstages:\n  - 1c-explorer\n  - 1c-developer\n  - 1c-code-reviewer\n';
  if (tier === 3) return 'name: tier3\nstages:\n  - 1c-explorer\n  - 1c-architect\n  - 1c-planner\n  - 1c-developer\n  - 1c-tester\n  - 1c-code-reviewer\n';
  if (tier === 4) {
    return [
      'name: tier4',
      'stages:',
      '  - 1c-explorer',
      '  - 1c-architect',
      '  - 1c-analytic',
      '  - 1c-planner',
      '  - 1c-developer',
      '  - 1c-tester',
      '  - 1c-code-reviewer',
      '  - verification',
      '',
    ].join('\n');
  }
  return '';
}

export function assertTierWorkflows(packageRoot) {
  const errors = [];
  for (const tier of [1, 2, 3, 4]) {
    const name = TIER_WORKFLOWS[tier];
    const file = path.join(packageRoot, 'workflows', `${name}.yaml`);
    if (!fs.existsSync(file)) {
      errors.push(`missing ${name}.yaml`);
      continue;
    }
    const parsed = parseWorkflowYaml(fs.readFileSync(file, 'utf8'), file);
    const validation = validateWorkflow(parsed);
    if (!validation.ok) errors.push(`${name}: ${validation.errors.join('; ')}`);
    if (parsed.name !== name) errors.push(`${name}: name is ${parsed.name}`);
  }
  return { ok: errors.length === 0, errors };
}
