import { tryClaim, resolveMemoryStateRoots } from '../../lib/memory-reconcile.mjs';

const pendingFile = process.argv[2];
const profile = process.argv[3];
const dirs = resolveMemoryStateRoots(profile);
const claimed = tryClaim(pendingFile, dirs.processing);
process.exit(claimed ? 0 : 2);
