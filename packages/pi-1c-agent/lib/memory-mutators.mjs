export const MEMORY_MUTATORS = Object.freeze([
  { server: 'memory', tool: 'remember', aliases: ['memory_remember'] },
  { server: 'memory', tool: 'forget', aliases: ['memory_forget'] },
  { server: 'knowledge', tool: 'remember', aliases: ['knowledge_remember'] },
  { server: 'knowledge', tool: 'write', aliases: ['knowledge_write'] },
  { server: 'knowledge', tool: 'edit', aliases: ['knowledge_edit'] },
  { server: 'knowledge', tool: 'add_resource', aliases: ['knowledge_add_resource'] },
  { server: 'knowledge', tool: 'forget', aliases: ['knowledge_forget'] },
  { server: 'knowledge', tool: 'move', aliases: ['knowledge_move'] },
  { server: 'knowledge', tool: 'delete', aliases: ['knowledge_delete'] },
  { server: 'knowledge', tool: 'import', aliases: ['knowledge_import'] },
]);

export function isMemoryMutator(server, tool) {
  const s = String(server ?? '').trim();
  const t = String(tool ?? '').trim().replace(new RegExp(`^${s}_`), '');
  return MEMORY_MUTATORS.some((m) => m.server === s && (m.tool === t || m.aliases.includes(String(tool ?? '').trim())));
}

export function mutatorAliases() {
  return MEMORY_MUTATORS.flatMap((m) => [m.tool === 'remember' && m.server === 'memory' ? 'memory_remember' : null, ...m.aliases].filter(Boolean))
    .concat(MEMORY_MUTATORS.map((m) => `${m.server}_${m.tool}`));
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function anonMutatorFallbackRegex() {
  const names = [...new Set(mutatorAliases())].sort();
  return new RegExp(names.map(escapeRe).join('|'));
}

export function mutatorCoveredByRegex(regex, name) {
  return regex.test(String(name ?? ''));
}
