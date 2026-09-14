# Profile tests

Single entry point for this repository (the Pi 1C **agent profile**, not a 1C dump):

```bash
node tests/run-all.mjs
```

`npm test` is the same command. Requires Node ≥ 18. Zero npm dependencies: the deterministic suite uses only the Node standard library.

## Guarantees

- **Offline and credential-free by default.** No network, Docker, `auth.json`, or provider keys are required. Missing optional MCP servers are not failures.
- **Live scenarios are opt-in.** Set `RUN_LIVE_SCENARIOS=1` (and provide `auth.json` plus an installed `pi-cursor-sdk`) to run the live layer. Without the flag, credentials, or SDK those tests are **skipped**, not failed.
- **Failure policy.** A red deterministic run is a real regression: fix the profile, or fix the test if it encoded the invariant wrong. The suite must not ship with an expected-fail.
- **Isolation.** Filesystem-effect tests copy the profile and/or a project into `fs.mkdtemp` (`os.tmpdir()`). They never write the real `mcp.json`, `settings.json`, `AGENTS.md`, or any real 1C project / `.dev.env`. After the full runner, `git status --porcelain` for the pre-existing tree must be unchanged.

## Layout

| Path | Type |
|---|---|
| `tests/lib/` | Pure helpers (unit-under-test) |
| `tests/unit/` | Unit tests on synthetic good/bad fixtures |
| `tests/contract/` | Regression tests against shipped profile files (read-only) |
| `tests/scenario/` | Behavior tests: static by default; live SDK gated |
| `tests/fixtures/` | Synthetic samples |

## Scenario review checklist

Scenario tests assert **file/action effects** (created / modified / deleted / untouched) and documented decision procedures. They must **not** assert the exact natural-language wording of a model reply. See `tests/scenario/no-reply-wording.test.mjs`.

## Coverage table

| Functionality / доработка | Covering test | Type | Status |
|---|---|---|---|
| Default `mcp.json` has no unsolicited memory/knowledge/1C-bundle | `unit/mcp-inspect` + `contract/mcp-default` | unit + regression | implemented |
| Vanessa MCP only in `mcp.optional/` | `contract/mcp-default` | regression | implemented |
| No `/help` `/plan` `/build` `/debug` prompts | `contract/command-surface` | regression | implemented |
| Prompt titles unprefixed; `/1c-*` alias stubs exist | `unit/commands` + `contract/command-surface` | unit + regression | implemented |
| `/session-rotate` opt-in, Pi-only, Settings catalog, handoff reuse | `contract/catalog` + `contract/command-surface` | regression | implemented |
| Destructive IB prompts confirm target | `contract/destructive-confirm` | regression | implemented |
| Writer/pipeline agents require JSON `## Upstream Handoff` | `unit/agents` + `contract/handoff` | unit + regression | implemented |
| `CAVEMAN` default `auto` | `unit/skills` + `contract/caveman` | unit + regression | implemented |
| `NOTICE` present; `settings.json` placeholder | `contract/notice-settings` | regression | implemented |
| Unpinned default `npm:pi-cursor-sdk` (no `@version`) | `contract/notice-settings` | regression | implemented |
| `upstream.lock.json` seeded pin | `contract/upstream-pin` | regression | implemented |
| No foreign machine-local paths in shipped tree | `unit/paths-scan` + `contract/machine-paths` | unit + regression | implemented |
| Lab extras present + isolated from `ai_rules_1c` | `contract/lab-extras` | regression | implemented |
| Memory stack portable (no lab compose, fragments, opt-in) | `contract/memory-stack` | regression | implemented |
| PLAN permits only planning artifacts, protects project code | `scenario/plan-only` | scenario (static) | implemented |
| `/checkmcp` default is status-only | `scenario/checkmcp-status` | scenario (static) | implemented |
| Fresh clone: optional MCP unconfigured | `scenario/fresh-clone` | scenario (static) | implemented |
| End-to-end file effects (created/modified/untouched) | `scenario/live-harness` | scenario (live, opt-in) | implemented |
| No test mutates real profile/projects | `contract/git-clean-guard` + `contract/isolation` | regression | implemented |

## Last full run

Recorded after `node tests/run-all.mjs` on 2026-09-15.

- **Pass count:** 50 passed, 0 failed
- **Skipped live scenarios:** 1 — `scenario/live-harness` PLAN-only file effects — reason: `RUN_LIVE_SCENARIOS is not 1`

