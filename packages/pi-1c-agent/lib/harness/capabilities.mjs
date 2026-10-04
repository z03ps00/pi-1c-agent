export const CAPABILITY_NAMES = Object.freeze([
  'metadata.tree',
  'metadata.object',
  'metadata.attributes',
  'metadata.forms',
  'code.symbol',
  'code.fragment',
  'code.module',
  'code.search',
  'graph.dependencies',
  'graph.usages',
  'graph.calls',
  'graph.impact',
  'ib.query',
  'ib.execute',
  'ib.metadata',
  'docs.platform',
  'docs.bsp',
  'docs.its',
  'docs.templates',
  'syntax.bsl',
  'test.unit',
  'test.ui',
  'repository.status',
  'repository.diff',
  'repository.history',
  'memory.short',
  'knowledge.long',
]);

const MATCHERS = {
  'metadata.tree': [/metadata[._-]?tree/, /\bsearch_metadata\b/, /\blist_metadata\b/, /\bmetadatasearch\b/],
  'metadata.object': [/object_dossier/, /get_object_dossier/, /get_metadata_details/, /metadata_details/, /object metadata/],
  'metadata.attributes': [/metadata_attributes/, /typed attributes/, /get_attributes/],
  'metadata.forms': [/metadata_forms/, /form_list/, /list_forms/],
  'code.symbol': [/search_function/, /\bcodesearch\b/, /code_symbol/, /find_symbol/],
  'code.fragment': [/code_fragment/, /get_fragment/, /module_fragment/, /symbol_body/],
  'code.module': [/module_structure/, /get_module\b/, /code_module/],
  'code.search': [/code[._-]?search/, /\bsearch_code\b/],
  'graph.dependencies': [/graph_dependencies/, /\bdependencies\b/, /depends_on/],
  'graph.usages': [/graph_usages/, /\busages\b/, /find_references/, /incoming_references/],
  'graph.calls': [/call_graph/, /\bcallers\b/, /\bcallees\b/, /graph_calls/],
  'graph.impact': [/trace_impact/, /graph_impact/, /\bimpact\b/],
  'ib.query': [/execute_query/, /\brun_query\b/, /ib_query/],
  'ib.execute': [/execute_code/, /eval_bsl/, /ib_execute/],
  'ib.metadata': [/ib_metadata/, /infobase_metadata/],
  'docs.platform': [/platform_docs/, /syntaxhelp/, /its_help_search/, /docs_platform/],
  'docs.bsp': [/\bbsp_docs\b/, /ssl_docs/, /docs_bsp/],
  'docs.its': [/docs_its/, /\bits_search\b/],
  'docs.templates': [/docs_templates/, /template_search/],
  'syntax.bsl': [/syntaxcheck/, /bsl_syntax/, /validate_bsl/, /syntax_bsl/],
  'test.unit': [/yaxunit/, /unit_test/, /test_unit/],
  'test.ui': [/vanessa/, /ui_test/, /test_ui/],
  'repository.status': [/repository_status/, /git_status/],
  'repository.diff': [/repository_diff/, /git_diff/],
  'repository.history': [/repository_history/, /git_log/],
  'memory.short': [/memory_recall/, /memory_remember/, /\bcognee\b/],
  'knowledge.long': [/knowledge_find/, /knowledge_search/, /\bopenviking\b/],
};

export function normalizeTool(tool) {
  if (typeof tool === 'string') return { name: tool, description: '' };
  return {
    name: String(tool?.name || tool?.toolName || ''),
    description: String(tool?.description || ''),
  };
}

function haystack(tool) {
  const rec = normalizeTool(tool);
  return `${rec.name}\n${rec.description}`.toLowerCase();
}

export function snapshotCapabilities(tools = []) {
  const blobs = (Array.isArray(tools) ? tools : []).map(haystack);
  const snapshot = {};
  for (const name of CAPABILITY_NAMES) {
    const matchers = MATCHERS[name] || [];
    snapshot[name] = blobs.some((text) => matchers.some((re) => re.test(text)));
  }
  return snapshot;
}

export function formatCapabilitySummary(snapshot = {}) {
  const lines = ['1C capabilities:'];
  for (const name of CAPABILITY_NAMES) {
    lines.push(`${name} = ${snapshot[name] ? 'available' : 'unavailable'}`);
  }
  return lines.join('\n');
}

export function formatCapabilityBlock(snapshot = {}) {
  const lines = ['1C Capabilities', '────────────────────────────'];
  for (const name of CAPABILITY_NAMES) {
    lines.push(`${name.padEnd(22)} ${snapshot[name] ? '✓' : '✗'}`);
  }
  return lines.join('\n');
}

export function formatCapabilityFooter(snapshot = {}) {
  const any = (prefix) => CAPABILITY_NAMES.some((name) => name.startsWith(prefix) && snapshot[name]);
  return `graph${any('graph.') ? '✓' : '✗'} code${any('code.') ? '✓' : '✗'} ib${any('ib.') ? '✓' : '✗'}`;
}

export function isStructuralToolName(toolName) {
  const text = String(toolName ?? '').toLowerCase();
  const structural = CAPABILITY_NAMES.filter((name) => /^(metadata|code|graph)\./.test(name));
  return structural.some((name) => (MATCHERS[name] || []).some((re) => re.test(text)));
}
