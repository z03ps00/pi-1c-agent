## 1. State machine (lib/plan-state.mjs)

- [x] 1.1 Add `ask` to the mode union and phase map (`ask-idle`); export `READ_ONLY_MODES = ['plan','ask']` and `isReadOnlyMode(mode)`.
- [x] 1.2 Add `enterAsk(state)` (keeps any ready plan, sets `ask-idle`); keep `enterPlan`/`enterBuild`/`executePlan`/`acceptPlan` behavior; add `completeBuild(state)` if execution-phase reset is needed.
- [x] 1.3 Add `DEFAULT_MODE` resolution: ASK unless `PI_1C_DEFAULT_MODE`/flag overrides; make `initialModeState()` return `{ mode, phase, plan:null, anonLevel:0 }`.
- [x] 1.4 Add anon helpers: `normalizeAnonLevel`, `parseAnonLevel`, `cycleAnonLevel`, `anonBlocksMemoryWrites/Reads/LocalTraces`, `ANON_MAX_LEVEL=3`.
- [x] 1.5 Add `sanitizeModeState(candidate)`: validate mode/phase pair, drop damaged plan, clamp `anonLevel` to 0–3, coerce boolean gate flags, correct `build-executing`/`plan-ready` without a plan.

## 2. Read-only + anon policy (lib/plan-policy.mjs)

- [x] 2.1 Add `getReadOnlyVisibleTools(mode, active, all)`: PLAN keeps `write`/`edit`, ASK strips them; keep the 1C read-only allowlist and `subagent_1c`; keep `mcp` proxy when active.
- [x] 2.2 Add `evaluateReadOnlyToolCall(mode, tool, input)`: ASK denies all `write`/`edit`; PLAN keeps `resolvePlanningWrite`; `bash` stays disabled in both; delegate MCP to the existing PLAN MCP checks.
- [x] 2.3 Port anon call resolver `describeMcpCall(toolName, input)` and `isRecallMcpCall` (all adapter shapes: `mcp` gateway, `mcp__server__tool`, bare `memory_*`/`knowledge_*`).
- [x] 2.4 Port `evaluateAnonMcpCall(level, server, tool)`: fail-closed for unknown `memory`/`knowledge` tools; `*_health` always allowed; level 2 blocks reads too.
- [x] 2.5 Port `evaluateAnonWriteCall(level, tool, input)` with PORTABLE roots: pending = `$PI_CODING_AGENT_DIR/state/agent-memory/pending`, handoff = project `handoffs/` (and `.pi/1c/**` if used); block pending at ≥1, handoff at ≥3. No `/mnt/vol_328` or `/home/<user>` literals.

## 3. Extension wiring (extensions/1c-mode/index.ts)

- [x] 3.1 Extend `ModeState` type with `phase` for ASK, `anonLevel`, `lastInjectedMode`; import new lib functions via `import * as` namespace + `libCall()` fail-closed wrapper (`/reload` safety).
- [x] 3.2 Add ASK instructions block and `switchToAsk`; extend `/mode` to accept `ask`; register `/1c-ask`; make `Ctrl+Alt+P` cycle BUILD → PLAN → ASK.
- [x] 3.3 Add authoritative `modeNote(mode)` prepended every run and one-shot `[1C MODE CHANGE]` notice via persisted `lastInjectedMode` (survives `/reload`/resume, no repeat); add mid-run "next turn" suffix.
- [x] 3.4 Add `/anon` command (`1|2|3|off|status`), `Ctrl+Alt+A` cycle, `registerFlag("anon")`, `PI_1C_ANON` env; single `setAnonLevel` entry point; footer `pi-1c-anon` status always visible.
- [x] 3.5 Update `updateStatus` for `1C:ASK` label/colour; update `applyReadOnlyTools`/`applyBuildTools` to use `getReadOnlyVisibleTools(mode, …)`.
- [x] 3.6 Wire double enforcement: in `pi.on("tool_call")` block on anon verdict first (every mode), then docker-policy, then `evaluateReadOnlyToolCall` for read-only modes; in `pi-mcp-adapter:tool-approval-request` `deny` blocked anon pairs regardless of mode, else the existing PLAN MCP check.
- [x] 3.7 `before_agent_start`: inject `modeNote` + PLAN/ASK/BUILD instructions + plan handoff (BUILD executing) + `anonNote(level)` when active; add `anonNote` text (level meaning, hard rule, `Memory: skipped — anonymous`).
- [x] 3.8 `session_start`: restore via `sanitizeModeState`; apply `--1c-mode`/`PI_1C_DEFAULT_MODE`; apply `--anon`/`PI_1C_ANON` (new session always 0, resume keeps); set read-only vs build tools by mode.

## 4. Tests (package tests/)

- [x] 4.1 Update `tests/plan-state.test.mjs`: ASK transitions, ASK-default + override, `sanitizeModeState` edge cases, anon-level normalize/parse/cycle.
- [x] 4.2 Extend `tests/plan-policy.test.mjs`: ASK hides/denies writes, PLAN planning writes still allowed, `evaluateAnonMcpCall` (levels 1/2, fail-closed, health), `evaluateAnonWriteCall` (pending/handoff by level).
- [x] 4.3 Add a portability assertion: no shipped `lib/`/`extension` file contains a foreign absolute path (`/mnt/vol_328`, `/home/<user>`); anon roots resolve from `$PI_CODING_AGENT_DIR`/project.
- [x] 4.4 Add a `/reload`-safety test: missing new lib export → `libCall` fail-closed fallback still blocks anon writes; run full suite `tests/run-all.mjs` green.

## 5. Profile documentation (docs-in-same-change)

- [x] 5.1 Update `rules-1c/core/modes.md`: add ASK and ANON (levels, surfaces, session-scope), state ASK-by-default startup and override.
- [x] 5.2 Update overlay `AGENTS.md`: PLAN/BUILD → PLAN/BUILD/ASK, add `/anon` and `Ctrl+Alt+A`, note portable trace paths and `Memory: skipped — anonymous`.
- [x] 5.3 Update `README.md`: dual-host note (enforcement Pi-only, Cursor prose-only), new ASK default (BREAKING), anon overview; update command catalog (`prompts/commands.md`) if present.

## 6. Verification

- [x] 6.1 Run the package test suite green and record results in `openspec/changes/add-ask-anon-modes/verification.md` (each spec scenario: pass/fail/skip-with-reason).
- [x] 6.2 Manual/dry check in Pi: `/mode ask|plan|build`, `Ctrl+Alt+P` cycle, `/anon 1|2|3|off`, `Ctrl+Alt+A`, footer badges; confirm write blocked in ASK, planning write allowed in PLAN, anon write/read blocked per level in BUILD.
- [x] 6.3 Confirm no foreign absolute path shipped and memory MCP stays optional (conditional policy intact); loop fixes until every required scenario passes.
