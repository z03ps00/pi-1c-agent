# Verification — v0.5.0

Release verification performed before ZIP packaging.

## Automated test suite

- Fast suite: **29/29 PASS**.
- Full suite: **30/30 PASS**.
- Full suite includes synthetic bootstrap coverage for all **13 upstream agent roles**.
- Package doctor: **CORE: PASS**.

Covered regressions and invariants:

- PLAN state machine: `PLAN_DRAFT -> PLAN_READY -> BUILD_EXECUTING`;
- greenfield PLAN produces a complete plan without creating project files;
- project-code writes and shell execution are blocked in PLAN;
- only scoped planning writes are allowed, with symlink-escape protection;
- unknown/custom mutating tools are denied by default in PLAN;
- read-only MCP/custom capabilities are preserved where allowed;
- writer agents cannot execute in parallel in one working tree;
- nested subagent orchestration is blocked;
- `## Upstream Handoff` is runtime-validated;
- workflow YAML is loaded as source of truth and invalid writer-parallel stages are rejected;
- verification gates require explicit verification evidence;
- package command/resource contract is checked;
- Configuration Knowledge init, draft lifecycle, precedence, conflicts, evidence validation, version binding, source-root normalization, fingerprint diff, invalidation proposals and supersedes/history behavior are tested.

## TypeScript extension entrypoints

The four package extension entrypoints were syntax/transpile parsed with TypeScript `--noCheck` and produced no syntax diagnostics:

- `extensions/1c-mode/index.ts`
- `extensions/1c-subagents/index.ts`
- `extensions/1c-admin/index.ts`
- `extensions/1c-knowledge/index.ts`

## Upstream pin

`comol/ai_rules_1c` is pinned to:

`8901177ef92b611537fe79a4e4dfe19c600d9cc8`

The release does not vendor the complete upstream snapshot because the upstream root license is recorded as `UNSPECIFIED`. Bootstrap fetches the pinned commit instead of floating `main`.

## Environment limitation

The build sandbox has no direct outbound Git/DNS path for a real pinned GitHub clone. Therefore the real-network bootstrap is not claimed as verified here. The adaptation/bootstrap path is covered by the synthetic 13-agent E2E test. A real-network install remains a post-deploy E2E on the user's machine.
