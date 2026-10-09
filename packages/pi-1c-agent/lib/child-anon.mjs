export function childAnonLevel(value) {
  const level = Math.trunc(Number(value) || 0);
  if (level <= 0) return 0;
  if (level >= 3) return 3;
  return level;
}

export function childAnonLaunch(value) {
  const level = childAnonLevel(value);
  return {
    level,
    args: ['--anon', String(level)],
    env: { PI_1C_ANON: String(level) },
  };
}

export function readParentAnonLevel() {
  const shared = globalThis.__PI_1C_ANON__;
  if (shared !== undefined && shared !== null && String(shared).trim() !== '') return childAnonLevel(shared);
  return childAnonLevel(process.env.PI_1C_ANON);
}
