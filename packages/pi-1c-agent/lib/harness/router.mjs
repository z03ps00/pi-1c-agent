import { bump } from './stats.mjs';

export const INTENTS = Object.freeze([
  'metadata_object',
  'metadata_tree',
  'code_symbol',
  'code_fragment',
  'dependencies',
  'usages',
  'call_graph',
  'live_data',
  'query',
  'platform_documentation',
  'configuration_rule',
  'project_knowledge',
  'known_file_edit',
  'text_artifact',
  'spec',
  'test',
  'delivery',
]);

const STRUCTURAL = new Set([
  'metadata_object',
  'metadata_tree',
  'code_symbol',
  'code_fragment',
  'dependencies',
  'usages',
  'call_graph',
]);

const CAPABILITY_FOR = {
  metadata_object: 'metadata.object',
  metadata_tree: 'metadata.tree',
  code_symbol: 'code.symbol',
  code_fragment: 'code.fragment',
  dependencies: 'graph.dependencies',
  usages: 'graph.usages',
  call_graph: 'graph.calls',
};

function textOf(input) {
  if (typeof input === 'string') return input;
  return String(input?.text ?? input?.prompt ?? '');
}

function namedFile(input, text) {
  if (typeof input === 'object' && input?.namedFile) return String(input.namedFile);
  const match = text.match(/(?:^|[\s`'"])([^\s`'"]+\.(?:bsl|xml|os))(?=$|[\s`'"])/i);
  return match ? match[1] : '';
}

export function classifyIntent(input) {
  const text = textOf(input);
  const file = namedFile(input, text);
  const lower = text.toLowerCase();
  if (/\bopenspec\b|openspec\//i.test(text)) return 'spec';
  if (/\btodo\b|буквальн|literal comment/i.test(text)) return 'text_artifact';
  if (/\.(?:json|ya?ml|md)\b/i.test(file) || /project rules|agents\.md|rules-1c/i.test(text)) return 'text_artifact';
  if (file && /(исправ|поправ|fix|edit|правк)/i.test(text)) return 'known_file_edit';
  if (typeof input === 'object' && (input.editTarget || input.namedFile) && /(исправ|fix|edit|правк)/i.test(text)) return 'known_file_edit';
  if (/в этой конфигурац|как у нас|customer-specific|локальн(ое|ый) поведен/i.test(lower)) return 'configuration_rule';
  if (/project knowledge|знани[ея] проекта/i.test(lower)) return 'project_knowledge';
  if (/синтаксис платформы|platform doc|документац(ия|ии) платформы/i.test(lower)) return 'platform_documentation';
  if (/live ib|жив(ой|ая|ую) баз|инфо?баз/i.test(lower)) return 'live_data';
  if (/\bquery\b|запрос к базе|execute_query/i.test(lower)) return 'query';
  if (/где используется|who uses|usages/i.test(lower)) return 'usages';
  if (/call graph|граф вызов|кто вызывает|callers/i.test(lower)) return 'call_graph';
  if (/зависимост|dependencies|impact|влиян/i.test(lower)) return 'dependencies';
  if (/fragment|фрагмент модуля/i.test(lower)) return 'code_fragment';
  if (/процедур|функци[юя]|symbol/i.test(lower) && !file) return 'code_symbol';
  if (/дерево метаданных|metadata tree|подсистем/i.test(lower)) return 'metadata_tree';
  if (/реквизит|объект метадан|справочник|документ\.|форм[аыу]/i.test(lower)) return 'metadata_object';
  if (/\.feature\b|vanessa|тест ui/i.test(lower)) return 'test';
  if (/\.cfe\b|\.cf\b|поставк|delivery/i.test(lower)) return 'delivery';
  if (file) return 'known_file_edit';
  return 'text_artifact';
}

function available(capabilities, name) {
  if (!name) return false;
  if (capabilities instanceof Map) return capabilities.get(name) === true;
  return Boolean(capabilities?.[name]);
}

export function legacyGrepFirst(intent) {
  return STRUCTURAL.has(intent) ? 'broad_grep' : 'direct_file';
}

export function decide(input = {}) {
  const text = textOf(input);
  const intent = input.intent || classifyIntent(input);
  const file = namedFile(input, text) || (typeof input.editTarget === 'string' ? input.editTarget : '');
  const capability = CAPABILITY_FOR[intent] || null;
  const capabilityAvailable = available(input.capabilities, capability);
  const newer = input.workingCopyNewer === true || (Array.isArray(input.dirtyPaths) && file && input.dirtyPaths.includes(file));
  const base = {
    intent,
    capability,
    namedFile: file,
    indexStale: false,
    fallback: false,
    allowRead: false,
    allowBroadGrep: false,
    blockBroadGrepUntilStructural: false,
    outsideStructuralChain: false,
    outcome: null,
  };

  if (intent === 'known_file_edit' || (file && !STRUCTURAL.has(intent))) {
    return { ...base, first: 'working_tree_file', allowRead: true, indexStale: newer };
  }
  if (intent === 'spec' || intent === 'text_artifact') {
    return { ...base, first: 'direct_file', allowRead: true, allowBroadGrep: true };
  }
  if (intent === 'configuration_rule' || intent === 'project_knowledge') {
    return { ...base, first: 'configuration_knowledge', allowBroadGrep: false };
  }
  if (intent === 'platform_documentation' || intent === 'live_data' || intent === 'query' || intent === 'test' || intent === 'delivery') {
    return { ...base, first: intent, outsideStructuralChain: true };
  }
  if (newer && file) {
    return { ...base, first: 'working_tree_file', allowRead: true, indexStale: true };
  }
  if (STRUCTURAL.has(intent) && capabilityAvailable) {
    return { ...base, first: capability, blockBroadGrepUntilStructural: true, allowRead: Boolean(file) };
  }
  if (STRUCTURAL.has(intent)) {
    return { ...base, first: 'bounded_file_search', fallback: true, allowRead: true, allowBroadGrep: true };
  }
  return { ...base, first: 'direct_file', allowRead: true };
}

export function interpretLookup({ capabilityAvailable = true, ok = false, matchCount = 0 } = {}) {
  if (!capabilityAvailable) return { outcome: 'unavailable', fallback: true, allowBroadGrep: true };
  if (ok && matchCount === 0) return { outcome: 'not_found', fallback: false, allowBroadGrep: false };
  if (ok) return { outcome: 'found', fallback: false, allowBroadGrep: false };
  return { outcome: 'unavailable', fallback: true, allowBroadGrep: true };
}

export function workingCopyWins({ workingCopyNewer = false, indexSignature = '', diskSignature = '' } = {}) {
  if (!workingCopyNewer) return false;
  return String(indexSignature) !== String(diskSignature);
}

function inputPath(input) {
  if (!input || typeof input !== 'object') return '';
  return String(input.path || input.file || input.file_path || input.target || input.glob || '');
}

function isExceptionInput(input, decision) {
  const file = inputPath(input);
  const pattern = String(input?.pattern || input?.query || '');
  if (decision?.namedFile && file && file.includes(decision.namedFile)) return true;
  if (/openspec|rules-1c|AGENTS\.md/i.test(file)) return true;
  if (/\.(json|ya?ml|md)$/i.test(file)) return true;
  if (/\btodo\b/i.test(pattern) || /\btodo\b/i.test(file)) return true;
  return false;
}

function isBroadSearch(toolName, input) {
  const name = String(toolName ?? '').toLowerCase();
  const file = inputPath(input);
  const command = String(input?.command || '');
  const fileLike = /\.[A-Za-z0-9]{1,8}$/.test(file);
  if ((name === 'grep' || name === 'rg' || name === 'glob' || name === 'ls' || name === 'find') && !fileLike) return true;
  if (name === 'bash' && /^\s*(rg|grep|find)\b/.test(command) && !/\.[A-Za-z0-9]{1,8}\b/.test(command)) return true;
  return false;
}

export function shouldBlockTool({ decision, toolName, input, structuralCallSeen = false } = {}) {
  if (!decision?.blockBroadGrepUntilStructural || structuralCallSeen) return null;
  if (isExceptionInput(input, decision)) return null;
  if (!isBroadSearch(toolName, input)) return null;
  const via = decision.capability || 'a structural capability';
  return {
    block: true,
    reason: `Structural intent ${decision.intent} uses ${via} before a broad search.`,
  };
}

export function applyDecisionStats(stats, decision) {
  if (decision?.fallback) bump(stats, 'fallbacks');
  return stats;
}

export function noteToolStats(stats, toolName, { blocked = false, structural = false } = {}) {
  if (blocked) return stats;
  const name = String(toolName ?? '').toLowerCase();
  if (structural) bump(stats, 'structuralCalls');
  else if (name === 'read') bump(stats, 'fileReads');
  else if (name === 'grep' || name === 'rg' || name === 'glob') bump(stats, 'broadGreps');
  return stats;
}
