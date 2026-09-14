# Verification — add-ask-anon-modes

Date: 2026-09-15. Loop 1 (final).

Package suite: `pi-1c-agent` `node tests/run-all.mjs` — **90/90 pass**.
Profile suite: `node tests/run-all.mjs` — **50 pass, 1 skip** (`RUN_LIVE_SCENARIOS` is not 1).

Live Pi TUI (`/mode`, hotkeys, footer) was not driven in this APPLY host. Surfaces are covered by package-contract greps of `extensions/1c-mode/index.ts` plus unit tests of the policy/state libs. Marked skip-with-reason where a live session is required.

## Spec scenarios (`agent-modes`)

| Scenario | Outcome | Evidence |
|---|---|---|
| Modes are enumerable and persisted | pass | `lib/plan-state.mjs` mode/phase union; session entry `pi-1c-mode-state`; tests in `plan-state.test.mjs` |
| A resumed session keeps its mode | pass | `session_start` restores via `sanitizeModeState`; env default not re-applied when a record exists |
| Fresh session is read-only by default | pass | `initialModeState()` → ASK; `default mode is ASK unless env overrides` |
| Default can be pinned to BUILD | pass | `PI_1C_DEFAULT_MODE=build` test; `--1c-mode` applied in `session_start` |
| Command switches mode | pass (dry) | `registerCommand("mode"|"1c-ask")`; live TUI skip |
| Hotkey cycles all three modes | pass (dry) | `Ctrl+Alt+P` BUILD→PLAN→ASK; package-contract grep |
| Mid-run switch defers to next turn | pass (dry) | `runningTurnSuffix` in `switchTo*` |
| Plan-ready is visible | pass (dry) | footer `1C:PLAN READY` in `updateStatus` |
| Model does not trust stale mode claims | pass (dry) | `# Current 1C mode` injected every `before_agent_start` |
| Change is announced once | pass (dry) | `[1C MODE CHANGE]` via persisted `lastInjectedMode` |
| Write is blocked in ASK | pass | `ASK hides write/edit and denies every file write…` |
| Planning roots are not writable in ASK | pass | same test, `openspec/` and `.pi/1c/plans/` denied |
| Read-only research still works | pass | ASK allows `read` in that test |
| Planning artifact write is allowed | pass | PLAN scoped write tests |
| Project code write is blocked in PLAN | pass | `PLAN blocks project code writes and shell` |
| Approved plan is executed by id | pass | `greenfield PLAN becomes ready…` + `executePlan` keeps id |
| Corrupt record does not crash session start | pass | `sanitizeModeState degrades damaged records` |
| Inconsistent plan phase is corrected | pass | same test (`plan-ready`/`build-executing` without plan) |
| Level 1 blocks a remember | pass | `evaluateAnonMcpCall` tests |
| Level 2 blocks a recall | pass | same; `health` remains allowed |
| Level 3 forbids handoff documents | pass | `evaluateAnonWriteCall` handoff roots; ephemeral `--no-session` is launcher-documented, not in-process |
| Write blocked even in BUILD | pass (dry) | `tool_call` runs anon verdict before mode gates; MCP hook denies regardless of mode |
| Unknown memory tool is treated as a write | pass | `evaluateAnonMcpCall(1, 'memory', 'invented_tool')` |
| New session starts non-anonymous | pass | `initialModeState().anonLevel === 0`; no restored record → 0 |
| Mode switch preserves anon level | pass (dry) | `enterAsk`/`enterPlan`/`enterBuild` spread existing state including `anonLevel` |
| No foreign absolute path is shipped | pass | `modes-anon.test.mjs` + product-health scan + profile machine-local scan |
| Substantial anonymous turn reports skip | pass (dry) | `anonNote` + blocked `tool_call` reason require `Memory: skipped — anonymous` |
| README states the Cursor limit | pass | README Dual host paragraph |
| Modes doc matches behavior | pass | `rules-1c/core/modes.md` ASK default + ANON |

## Extra checks (task 6.3)

| Check | Outcome |
|---|---|
| No `/mnt/vol_328` or `/home/<user>` in shipped lib/extensions | pass |
| Overlay memory policy still conditional (opt-in Cognee/OpenViking) | pass (`AGENTS.md` unchanged shared-context block) |
| Default `mcp.json` still empty of unsolicited memory servers | pass (profile contract test) |
