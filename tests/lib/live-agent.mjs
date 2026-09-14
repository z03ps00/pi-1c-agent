import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { profileRoot } from './profile-root.mjs';

const require = createRequire(import.meta.url);

export function liveSkipReason() {
  if (process.env.RUN_LIVE_SCENARIOS !== '1') {
    return 'RUN_LIVE_SCENARIOS is not 1';
  }
  const sdk = resolveSdkName();
  if (!sdk) return 'pi-cursor-sdk is not installed';
  const authPath = path.join(profileRoot(), 'auth.json');
  if (!fs.existsSync(authPath)) return 'auth.json is missing';
  return null;
}

function resolveSdkName() {
  for (const name of ['pi-cursor-sdk', '@mariozechner/pi-cursor-sdk']) {
    try {
      require.resolve(name);
      return name;
    } catch {
      // keep looking
    }
  }
  return null;
}

export async function tryLoadLiveSdk() {
  const name = resolveSdkName();
  if (!name) return null;
  const mod = await import(name);
  const run = mod.runAgent || mod.run || mod.prompt || mod.default;
  if (typeof run !== 'function') return null;
  return { name, mod, run };
}
