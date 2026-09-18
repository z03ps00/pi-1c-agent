import fs from 'node:fs';
import { knowledgeRevision } from './knowledge.mjs';
import { duplicateQueueIds, queueItemCounts } from './memory-reconcile.mjs';
import { mcpSessionStats } from './memory-mcp.mjs';
import { listInFlightSlots, runtimeProfileDir } from './runtime-scheduler.mjs';

export function collectRuntimeStatus({ profileDir, cwd } = {}) {
  const profile = runtimeProfileDir(process.env, profileDir);
  const memory = profile ? queueItemCounts(profile) : { pending: 0, processing: 0, done: 0, failed: 0 };
  const duplicates = profile ? duplicateQueueIds(profile) : [];
  const slots = profile ? listInFlightSlots(profile) : [];
  const mcp = mcpSessionStats();
  let revision = 0;
  try { revision = knowledgeRevision(cwd || process.cwd()); } catch { revision = 0; }
  return {
    profileDir: profile || null,
    inflightChildren: slots.length,
    slots,
    memory,
    duplicateQueueIds: duplicates,
    knowledgeRevision: revision,
    mcp,
  };
}

export function formatRuntimeStatus(status) {
  const dup = status.duplicateQueueIds?.length
    ? ` duplicates=${status.duplicateQueueIds.map((d) => `${d.id}:${d.count}`).join(',')}`
    : '';
  return [
    `runtime inflight=${status.inflightChildren}`,
    `memory pending=${status.memory.pending} processing=${status.memory.processing} done=${status.memory.done} failed=${status.memory.failed}${dup}`,
    `knowledge revision=${status.knowledgeRevision}`,
    `mcp init=${status.mcp.initCount} reset=${status.mcp.resetCount}`,
  ].join('\n');
}

export function runtimeDiagnosticsExist(profileDir) {
  const profile = runtimeProfileDir(process.env, profileDir);
  if (!profile) return false;
  try {
    return fs.existsSync(`${profile}/state/runtime`);
  } catch {
    return false;
  }
}
