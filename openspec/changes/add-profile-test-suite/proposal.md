## Why

The Agent Profile has real, hard-won behavior (unprefixed command surface, opt-in MCP, allow-and-degrade Docker, JSON handoff, cross-platform paths, `caveman auto`, upstream pin, lab-extras isolation), but nothing in this git tree guards it. The `productize-pi-1c-agent` and `embed-lab-vanessa-kd-beta` changes were verified once by hand; the sibling `pi-1c-agent` package has `tests/` but this profile repo has **zero** automated checks. Any future edit can silently regress an invariant and no one would notice until a user hits it.

## What Changes

- Add a self-contained test harness in this repo under `tests/`, using Node's built-in `node:test` runner (Node 24 is present) with **zero external dependencies**, mirroring the sibling package convention (`run-all.mjs` + `*.test.mjs` + pure `lib/*.mjs` helpers).
- Add a single entry point: `node tests/run-all.mjs` (and a minimal `package.json` so `npm test` works). Default run is **deterministic, offline, and requires no credentials**.
- **Unit tests** for small pure helpers that parse/scan profile content (command-title parser, catalog classifier, `mcp.json` inspector, machine-path scanner, handoff-block detector, alias-stub detector, front-matter reader).
- **Regression/contract tests** that run those helpers against the **actual shipped profile files** and assert every already-implemented доработка still holds (the invariants from the two OpenSpec change specs — one assertion per requirement/scenario).
- **Scenario tests** that check agent *behavior* (actions taken, files created/modified, files left untouched, final result) rather than exact LLM text. These run the agent through `pi-cursor-sdk` against an **isolated temp copy** of the profile and a temp project workspace. Because they need credentials and are non-deterministic, they are **opt-in** behind `RUN_LIVE_SCENARIOS=1` and never run in the default suite; the default suite still includes deterministic "static scenario" contract checks over the prompt/rule decision text.
- Add a **coverage table** (functionality → test → type → status) kept in the change and mirrored in `tests/README.md`.
- Strict **isolation**: any test that touches the filesystem operates only inside an OS temp dir created with `fs.mkdtemp`; tests never mutate the real profile, the real `mcp.json`/`settings.json`, or any real 1C project.

This change adds tooling and one new behavioral capability (the harness contract). It does **not** change any existing command, rule, prompt, agent, skill, or MCP config. If a regression test fails against current files, that is a real defect to fix — in the test or in the profile — not a spec change here.

## Capabilities

### New Capabilities

- `profile-test-harness`: the contract for the profile's automated test suite — single runner, offline deterministic default, opt-in live scenario layer, strict temp-dir isolation and no-mutation guarantee for real profile/projects, the three test types (unit, regression/contract, scenario), behavior-not-text assertions for scenarios, and the maintained coverage table.

### Modified Capabilities

- none (main `openspec/specs/` is empty; the invariants under test are the deltas already declared by `productize-pi-1c-agent` and `embed-lab-vanessa-kd-beta`, which this change does not modify).

## Impact

- This git profile (new, additive only): `tests/` (runner, `lib/` helpers, `*.test.mjs`, fixtures, `tests/README.md`), a minimal root `package.json` (`private`, `test` script), and a coverage table. `.gitignore` may gain a temp/artifact ignore line.
- Reads (never writes) the shipped invariant sources: `mcp.json`, `settings.json`, `AGENTS.md`, `README.md`, `NOTICE`, `upstream.lock.json`, `prompts/**`, `agents/**`, `skills/**`, `rules-1c/**`.
- Runtime dependency: Node ≥ 18 for `node:test` (24 present). Live scenario layer additionally needs `pi-cursor-sdk` (already in `settings.json` packages) plus provider credentials from `auth.json`; it is skipped when those are absent.
- Not a 1C CFE/CF: the target container is the Pi profile itself, not a 1C extension. No `.dev.env`, no infobase, no downstream project is touched.
