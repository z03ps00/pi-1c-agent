# Verification — v0.4.2

Executed locally against the package source.

## Automated tests

`node tests/run-all.mjs`

Result: **14/14 PASS**.

Coverage includes:

- greenfield PLAN produces a ready plan without creating files;
- incomplete plan does not become PLAN_READY;
- source-code writes and shell are blocked in PLAN;
- scoped OpenSpec/plan artifact writes are allowed;
- symlink escape is blocked;
- unknown custom mutators are not exposed in PLAN;
- MCP capability survives BUILD child routing;
- PLAN filters writer tools but preserves read-only MCP tools;
- writer agents cannot run in parallel;
- valid handoff parses; malformed handoff fails;
- package manifest registers all three extensions;
- `/1c-doctor` has no prompt-template collision;
- synthetic upstream with 13 agents/rules/standards/skills/commands is adapted;
- synthetic project doctor ends with `CORE: PASS`.

## TypeScript syntax

All three extension entrypoints were transpile-parsed with TypeScript compiler API without syntax diagnostics.

## Limitation

A real external-network install of the pinned GitHub commit was not executed inside this sandbox because the container has no direct DNS/network access. The bootstrap path is tested with a synthetic source; real Git fetch remains an environment-dependent E2E step for the user's machine.
