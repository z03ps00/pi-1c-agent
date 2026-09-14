## Context

See `proposal.md - Why`. The profile is host-agnostic markdown + JSON (rules, prompts, agents, skills, `mcp.json`, `settings.json`), not compiled code. The "функционал" to protect is a set of textual/structural invariants ("доработки") already declared by two OpenSpec changes:

- `productize-pi-1c-agent` — `command-surface`, `mcp-lifecycle`, `agent-runtime-contract`, `upstream-airules-sync`.
- `embed-lab-vanessa-kd-beta` — `lab-extras-lifecycle`, `vanessa-scenario-protocol`, `kd-exchange-toolkit`, `humanizer-ru-editor`.

The sibling package `~/.pi/packages/pi-1c-agent/tests/` already proves the convention we mirror: `node:test`, a `run-all.mjs` that shells `node --test <files>`, pure `lib/*.mjs` helpers (`findMachineLocalPathHits`, `findUnsolicitedMcpServers`, `scanMachineLocalPaths`, `inspectMcpJsonFile`, `bootstrapWritesOptionalMcp`), and `.test.mjs` files. That package is outside this git tree; this repo has no tests. Node 24 is present. `settings.json` already lists `pi-cursor-sdk` as a package.

## Goals / Non-Goals

**Goals:**
- One offline, credential-free, dependency-free deterministic runner that a maintainer can run after any edit and immediately see whether the доработки still hold.
- Encode each existing invariant as a regression assertion tied to the real shipped file, so reverting a доработка turns the suite red with a useful message.
- Provide a behavior-level scenario layer (files created/modified/untouched, actions, final result) that is opt-in and isolated.
- Strict isolation: no test mutates the real profile or any real project.

**Non-Goals:**
- Not asserting exact LLM wording anywhere.
- Not changing any existing command, rule, prompt, agent, skill, or MCP config (this change is additive tooling).
- Not building a bespoke test framework, TypeScript build, or third-party test runner.
- Not testing the sibling `pi-1c-agent` package internals (it has its own suite); we only mirror its style.
- Not running live IB loads, paid-bundle installs, or Docker mutations.

## Decisions

**D1 — Runner: Node built-in `node:test` + `tests/run-all.mjs`, zero deps.** Mirrors the sibling package, needs no `node_modules`, works on Windows/Linux/macOS. A minimal root `package.json` (`private: true`, `"test": "node tests/run-all.mjs"`) makes `npm test` an alias. Alternatives: Vitest/Jest (adds install + network, contradicts the credential/offline goal); a shell-only grep script (poor assertions, weak isolation). Rejected.

**D2 — Layer split by directory.**
- `tests/lib/*.mjs` — pure helpers (the unit-under-test). No filesystem side effects; take strings/objects, return data.
- `tests/unit/*.test.mjs` — exercise helpers on synthetic good/bad inputs.
- `tests/contract/*.test.mjs` — the regression layer: read the real shipped files (read-only) and assert invariants via the helpers.
- `tests/scenario/*.test.mjs` — behavior tests; deterministic "static-scenario" checks run by default, live SDK checks gated by `RUN_LIVE_SCENARIOS=1`.
- `tests/fixtures/**` — synthetic compliant/violating samples for unit tests.
Naming makes the test type unambiguous (spec requirement).

**D3 — Invariants become small helpers, not inline regex per test.** Each доработка maps to a pure function so it is unit-testable and reused by the contract layer. Planned helpers: `parseCommandTitle(md)`, `classifyCatalogSection(commandsMd, name)`, `inspectMcpJson(obj)` → `{unsolicited[], optionalOnly}`, `scanMachineLocalPaths(files)`, `hasJsonHandoffBlock(agentMd)`, `isAliasStub(md)`, `readSkillFrontmatter(md)`, `findPromptFiles(dir)`, `readCavemanDefault(files)`. This matches the sibling's helper-first style and gives good failure messages (file + invariant).

**D4 — Isolation via `fs.mkdtemp(os.tmpdir())`.** Any test needing write effects first copies the profile (or a minimal slice) into a temp dir and runs there; teardown removes it. The contract layer is strictly read-only against the real tree. A guard test asserts `git status --porcelain` is unchanged for pre-existing tracked files after the run. Real 1C projects and `.dev.env` are never referenced.

**D5 — Scenario behavior model.** Default scenario tests are deterministic "static-scenario" contracts: they assert the documented decision procedure of a prompt/rule (e.g. PLAN allows planning artifacts only; `/checkmcp` default is status-only; destructive prompts demand confirmation) by inspecting the prompt/rule text and the effect surface it describes — behavior expressed as invariants, no model call. The live layer (opt-in) uses `pi-cursor-sdk` to run the agent against a temp profile copy + temp project, then diffs the temp filesystem to assert created/modified/untouched sets and the final artifact — never the reply wording. Live tests self-skip (via `test(..., {skip})`) when the flag/credentials/SDK are missing, so the default run stays green. Alternative — making live model calls the default — rejected: non-deterministic, needs credentials, violates the offline goal.

**D6 — Coverage table lives in `tests/README.md`** (and is summarized in `tasks.md`): columns functionality / covering test / type / status. Keeps the "single simple way to know it still works" criterion visible next to the runner.

**D7 — Failure policy.** A red deterministic suite means a real regression: fix the profile or, if the test encoded the invariant wrong, fix the test. The suite is not allowed to ship with an expected-fail. This is stated in `tests/README.md`.

## Risks / Trade-offs

- **Static-scenario tests can't catch pure model-behavior regressions** (the model ignoring a rule) → Mitigation: the opt-in live SDK layer covers true end-to-end behavior; the default layer locks the *instructions the model reads*, which is where profile regressions actually originate.
- **Live SDK tests are flaky / credential-bound** → Mitigation: gated off by default, reported as skipped, never counted as failure; they are a maintainer tool, not CI-gating.
- **Over-strict regex invariants become brittle to harmless rewordings** → Mitigation: helpers assert structural facts (a server key absent, a file present, a title token) rather than whole sentences; unit tests pin each helper on good/bad inputs.
- **Trailing-space profile directory name and `/mnt/vol_238_ssd` vs `/mnt/vol_328` alias** → Mitigation: tests resolve paths relative to `import.meta.url`, never hardcode the absolute root, and the machine-path scanner must not flag the profile's own resolved root.
- **Duplication with the sibling package's machine-path/MCP checks** → Accepted: the profile must be independently testable on a fresh clone without the package installed.

## Open Questions

- Exact live-scenario prompts to include first (PLAN-only planning, `/checkmcp` status-only, `/commands` classification) can be chosen during implementation without changing these specs or the task breakdown.
