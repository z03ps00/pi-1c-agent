# Verification — v0.6.1

Release verification for the standard 1C source-scaffold update.

## Automated tests

- Fast suite: **44/44 PASS**.
- Full suite: **45/45 PASS**.
- Synthetic bootstrap still covers all **13 upstream agent roles**.
- Package doctor: **CORE: PASS**.

New v0.6.1 coverage includes:

- `src/cf` is recognized as the main configuration source root while `src` is kept as the shared source-layout root;
- greenfield projects default to `src` layout and `src/cf` main configuration root;
- final Apply creates only missing `cf`, `cfe`, `epf`, `erf` directories;
- existing source files are preserved byte-for-byte by scaffold creation;
- scaffold creation is rejected when the requested layout would escape the trusted project root;
- `project.yaml` and `init-state.json` record the source-layout contract and completion state;
- layout-aware ENV autodetection proposes `EXPORT_PATH=src/cf` and `EXTENSIONS_PATH=src/cfe`;
- `/1c-init status` reports scaffold completeness;
- `/1c-doctor project` treats an enabled but incomplete scaffold as a required failure.

## TypeScript entrypoints

All five extension entrypoints were transpile/syntax parsed with the TypeScript compiler API without error diagnostics:

- `extensions/1c-mode/index.ts`
- `extensions/1c-subagents/index.ts`
- `extensions/1c-admin/index.ts`
- `extensions/1c-knowledge/index.ts`
- `extensions/1c-init/index.ts`

## Scaffold safety invariants

- Scaffold creation happens only after final `/1c-init` Apply confirmation.
- Existing `cf/cfe/epf/erf` directories are never cleared, renamed, or overwritten.
- The initializer creates directories only inside the trusted project root.
- No `.gitkeep` marker is injected into 1C source directories.
- Configuration Knowledge continues to fingerprint the actual configuration source root (normally `src/cf`), not the common layout root (`src`).

## Upstream pin

`comol/ai_rules_1c` remains pinned to:

`8901177ef92b611537fe79a4e4dfe19c600d9cc8`
