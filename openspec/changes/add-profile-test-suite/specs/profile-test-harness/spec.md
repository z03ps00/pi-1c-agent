## Purpose

Defines the contract for the Agent Profile's automated test suite: one runner, a deterministic offline default, an opt-in live behavioral layer, strict temp-dir isolation, and a maintained coverage table — so future edits to the profile surface regressions before a user does.

## ADDED Requirements

### Requirement: Single runner for the whole suite

The profile SHALL provide exactly one documented entry point that runs the entire deterministic test suite. Running it MUST discover and execute every deterministic test without extra arguments, MUST exit non-zero if any test fails and zero only when all pass, and MUST require no network access, no Docker, and no provider credentials. Invoking it MUST NOT install external dependencies (the deterministic suite uses only the Node standard library).

#### Scenario: One command runs everything

- **WHEN** a maintainer runs the documented single command (`node tests/run-all.mjs`) on a fresh clone with Node ≥ 18 and no credentials
- **THEN** all deterministic unit and regression tests execute and the process exits zero when they pass, non-zero when any fails

#### Scenario: Offline and credential-free default

- **WHEN** the default suite runs with no `auth.json`, no network, and no Docker socket
- **THEN** it still completes and reports pass/fail without erroring on missing credentials or servers

### Requirement: Tests never mutate the real profile or real projects

Every test that touches the filesystem MUST operate only inside an isolated temporary directory created for that test (for example via `fs.mkdtemp`) and MUST remove or abandon it without side effects. Tests MUST NOT modify, create, or delete files in the tracked profile tree (including `mcp.json`, `settings.json`, `AGENTS.md`, `prompts/**`, `agents/**`, `skills/**`, `rules-1c/**`), and MUST NOT touch any real downstream 1C project or `.dev.env`.

#### Scenario: Clean git tree after a full run

- **WHEN** the full suite finishes (pass or fail)
- **THEN** `git status --porcelain` for the tracked profile files that existed before the run is unchanged (no test wrote into the real profile)

#### Scenario: Filesystem-effect tests use a temp copy

- **WHEN** a test needs to observe files being created, modified, or left untouched
- **THEN** it does so against a temporary copy of the profile and/or a temporary project workspace, never the real ones

### Requirement: Three test types are present and distinguishable

The suite MUST contain and clearly separate three kinds of tests: unit tests for individual pure helper functions/components, regression/contract tests that assert already-implemented доработки still hold against the real shipped profile files, and scenario tests that exercise end-to-end agent behavior. Each test MUST make it discoverable which type it is (by file/module grouping or naming).

#### Scenario: A reader can tell the type of a test

- **WHEN** a maintainer opens the `tests/` tree
- **THEN** unit, regression/contract, and scenario tests are grouped or named so their type is unambiguous

### Requirement: Unit tests cover the profile-inspection helpers

Behavior that can be reduced to a pure function (parsing a command title, classifying a `/commands` catalog section, inspecting `mcp.json` for unsolicited servers, scanning text for machine-local paths, detecting a JSON `## Upstream Handoff` block, detecting a `/1c-*` alias stub, reading skill front-matter) MUST be implemented as a testable helper and covered by unit tests using synthetic inputs (both the passing and the violating case).

#### Scenario: Helper is proven on both good and bad input

- **WHEN** a unit test exercises a profile-inspection helper
- **THEN** it asserts the correct result for a compliant input and for a deliberately non-compliant input

### Requirement: Regression tests lock the existing доработки against the real files

The suite MUST include regression/contract tests that run against the actual shipped profile files and assert each already-implemented доработка from the current profile, at minimum: default `mcp.json` registers no memory/knowledge/1C-bundle (8002–8008) servers; no `/help`, `/plan`, `/build`, `/debug` prompt files exist; prompt titles use canonical unprefixed names (`/installmcp`, not `/1c-installmcp`); the `/1c-*` alias stubs still exist for the alias window; `/commands` and `/review-airules` prompts exist and `/review-airules` is classified maintainer; destructive infobase prompts (`update1cbase`, `restore-testbase`, `deploy-and-test`, `build-release`) require target confirmation; writer/pipeline agents require a JSON `## Upstream Handoff`; the shipped `CAVEMAN` default is `auto`; `NOTICE` exists and separates upstream from overlay; no shipped file contains a foreign machine-local path; `settings.json` uses the `<path-to-pi-1c-agent>` placeholder, not a real machine path; `upstream.lock.json` carries the seeded pin; lab extras (`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru`) are present as skills and Vanessa MCP stays in `mcp.optional/`, not default `mcp.json`.

#### Scenario: A reverted доработка turns the suite red

- **WHEN** a future edit reintroduces a violation (for example adds `memory` to default `mcp.json`, renames a prompt title back to `/1c-installmcp`, or drops `NOTICE`)
- **THEN** at least one regression test fails and names the offending file and invariant

#### Scenario: Current profile passes the regression set

- **WHEN** the regression tests run against the profile as it stands today
- **THEN** they all pass (or a failure is treated as a real defect to fix in the profile or the test, not as an expected condition)

### Requirement: Scenario tests assert behavior, not LLM text

Scenario tests MUST verify agent behavior — which actions ran, which files were created or modified, which files were required to stay unchanged, and the final result — and MUST NOT assert on the exact natural-language wording of the model's reply. They exercise the agent against an isolated temporary copy of the profile and a temporary project workspace.

#### Scenario: Assertion is on file effects, not phrasing

- **WHEN** a scenario test checks, e.g., that PLAN-style planning produces only planning artifacts and leaves project code untouched, or that a `/checkmcp` status run starts no containers
- **THEN** it asserts on the resulting filesystem/action effects and forbidden mutations, not on the specific sentence the model produced

#### Scenario: Untouched files are explicitly verified

- **WHEN** a scenario test defines files that must not change
- **THEN** it fails if any of those files is created, modified, or deleted

### Requirement: Live scenario layer is opt-in and does not break the default run

Scenario tests that invoke a real model (via `pi-cursor-sdk`) MUST be gated behind an explicit opt-in (for example `RUN_LIVE_SCENARIOS=1`) and MUST be skipped — reported as skipped, not failed — when the opt-in is absent or credentials/SDK are unavailable. The deterministic default suite MUST stay green without them.

#### Scenario: Default run skips live scenarios cleanly

- **WHEN** the suite runs without the live opt-in or without credentials
- **THEN** live scenario tests are reported as skipped and the overall deterministic result is still green

#### Scenario: Opt-in enables the live layer

- **WHEN** a maintainer sets the opt-in flag and provides credentials
- **THEN** the live scenario tests run against isolated temp copies and report pass/fail on behavior

### Requirement: A coverage table maps functionality to tests

The change MUST maintain a coverage table listing, for each covered piece of functionality/доработка: the functionality, the test that covers it, the test type (unit / scenario / regression), and a status. The table MUST live where the runner is documented (e.g. `tests/README.md`) so a reader can see what is and is not covered.

#### Scenario: Reader finds coverage at a glance

- **WHEN** a maintainer opens the test documentation
- **THEN** a table shows each functionality, its covering test, the test type, and status
