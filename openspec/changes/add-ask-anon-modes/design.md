## Context

See `proposal.md` — Why. The mode logic lives in the Pi extension `1c-mode`, shipped from the global package `pi-1c-agent` (`extensions/1c-mode/index.ts`, `lib/plan-state.mjs`, `lib/plan-policy.mjs`). Today it implements only PLAN/BUILD, defaults to BUILD, disables `bash` in PLAN, and allows PLAN planning writes under `openspec/**`, `.pi/1c/plans/**`, `.pi/1c/knowledge-drafts/**`.

The reference implementation is the DevOps profile (`/mnt/vol_328/MCP/devops-context/pi`): `devops-plan-state.mjs` (adds ASK, anon levels, `sanitizeModeState`), `devops-plan-policy.mjs` (read-only classifier shared by PLAN/ASK, `getReadOnlyVisibleTools`, and the anon policy `describeMcpCall`/`evaluateAnonMcpCall`/`evaluateAnonWriteCall`), and `extensions/devops-mode/index.ts` (commands, hotkeys, footer, double enforcement, per-turn mode note, mode-change notice, `/reload`-safe namespace imports).

Hard constraints from this profile:
- `agent-runtime-contract` forbids machine-local absolute paths in shipped files; the DevOps anon code hardcodes `/mnt/vol_328/MCP/...` and `/home/pavel/...`, so those must be re-expressed as `$PI_CODING_AGENT_DIR` and project-relative paths.
- The overlay memory policy is conditional (recall/remember only when Cognee/OpenViking are opted in and connected) — the port must not make memory MCP mandatory.
- Enforcement host is Pi only; Cursor is documentation-only.

## Goals / Non-Goals

**Goals:**
- Add ASK as a first-class read-only mode alongside the existing PLAN/BUILD, with ASK as the new startup default (overridable).
- Add ANON levels 0–3 with double, fail-closed enforcement in every mode and portable trace paths.
- Add the supporting glue: authoritative per-turn mode note, one-shot mode-change notice, hardened `sanitizeModeState`.
- Keep PLAN/BUILD behavior intact; keep the 1C-specific read-only tool allowlist (`docsearch`, `ssl_search`, `syntaxcheck`, `knowledge_1c`, `subagent_1c`, …).

**Non-Goals:**
- No `caveman` output style port (the 1C profile has its own `CAVEMAN=auto` policy).
- No startup shared-context recall gate and no post-task memory completion gate from DevOps (memory-workflow features, tracked separately).
- No read-only `bash` classifier: `bash` stays fully disabled in ASK and PLAN.
- No Cursor-side enforcement; documentation only.
- No changes to `docker-policy.mjs` / `agent-policy.mjs` semantics beyond what modes require.

## Decisions

### D1: Reuse the existing `1c-mode` extension and libs, not a new extension
Extend `lib/plan-state.mjs`, `lib/plan-policy.mjs`, and `extensions/1c-mode/index.ts` in place. Alternative (a separate `1c-anon` extension) was rejected: anon must gate the same `tool_call`/MCP-approval hooks the mode extension already owns, and two extensions racing on the same hooks/footer would conflict.

### D2: `mode` becomes `plan|build|ask`; state gains `phase` for ASK and an `anonLevel` field
`initialModeState()` returns `{ mode: DEFAULT_MODE, phase, plan: null, anonLevel: 0 }`. `DEFAULT_MODE` resolves ASK unless `PI_1C_DEFAULT_MODE`/`--1c-mode` overrides. Add `enterAsk`, and make `sanitizeModeState` the single validator for restored records (mode/phase pair, plan object, anon level, boolean gate flags). Rationale: mirrors the DevOps state machine that is already battle-tested; keeps one source of truth for phase legality.

### D3: Read-only policy is shared by PLAN and ASK, with ASK stricter on writes
Add `getReadOnlyVisibleTools(mode, active, all)`: PLAN keeps `write`/`edit` (for planning artifacts); ASK filters them out entirely. Add `evaluateReadOnlyToolCall(mode, tool, input)`: ASK denies every `write`/`edit`; PLAN keeps the existing `resolvePlanningWrite` check. `bash` returns disabled for both (unchanged 1C behavior). Rationale: one classifier, mode-aware at the edges — matches DevOps structure minus the read-only bash allowance we deliberately drop.

### D4: ANON policy module mirrors DevOps but with portable roots
Port `describeMcpCall`, `evaluateAnonMcpCall`, `evaluateAnonWriteCall`, plus `normalizeAnonLevel`/`parseAnonLevel`/`cycleAnonLevel`. Replace the hardcoded constants:
- `ANON_PENDING_ROOT` → resolved from `process.env.PI_CODING_AGENT_DIR` + `state/agent-memory/pending` (fallback to `$HOME/.cursor`/profile dir only as a last resort, never a foreign machine path).
- `ANON_HANDOFF_ROOTS` → project-relative `handoffs/` (resolved against `cwd`), plus `.pi/1c/**` handoff drafts if used.
Shared-memory servers remain `['memory','knowledge']`; read-only allowlists per server are copied. Fail-closed: unknown tool on those servers = write.

### D5: Double enforcement wired into the two hooks the extension already has
- `pi.on("tool_call")`: if `anonLevel>0`, evaluate anon verdict first and `block` on deny (every mode). Then run the existing docker-policy check and, for read-only modes, `evaluateReadOnlyToolCall`.
- `pi.events.on("pi-mcp-adapter:tool-approval-request")`: if `anonLevel>0`, `deny` a blocked server/tool pair regardless of mode; otherwise fall through to the existing PLAN read-only MCP check.
Rationale: identical defence-in-depth to DevOps; the MCP hook catches calls that bypass `tool_call` shape.

### D6: `/reload`-safe library access for the new anon functions
Import the new lib functions through a namespace object (`import * as planPolicyLib`) accessed via a `libCall()` wrapper with a local fail-closed fallback, exactly as DevOps does. Rationale: after `/reload` the entry file re-executes while already-imported `lib/*.mjs` keep their old export set; a direct named import of a newly added export can be `undefined` and would break every tool call. This is a known DevOps incident (2026-09-13) we must not reproduce.

### D7: Surfaces
Add `registerCommand("1c-ask")`, extend `/mode` to accept `ask`, extend the `Ctrl+Alt+P` handler to a three-way cycle, add `registerCommand("anon")` and `registerShortcut(Key.ctrlAlt("a"))`, `registerFlag("anon")`. Footer: extend `updateStatus` with the `1C:ASK` label and a persistent `pi-1c-anon` status item (`anon:off|1|2|3`). Prompt injection in `before_agent_start`: prepend `modeNote(mode)`, choose PLAN/ASK/BUILD instructions, append `anonNote(level)` when active, and emit the one-shot `[1C MODE CHANGE]` message via the persisted `lastInjectedMode`.

### D8: Level-3 ephemeral session is a launcher concern
The extension cannot suppress its own transcript; per DevOps, level 3 relies on the launcher adding `--no-session`. Since the shipped 1C product may be launched directly by `pi` or via Cursor, level 3 will: (a) always enforce the no-handoff + no-write rules in-process, and (b) document that a fully ephemeral transcript additionally requires launching with `--no-session` (or a profile launcher that adds it). We will not hard-require a lab-specific launcher.

## Risks / Trade-offs

- **Default flip to ASK changes startup behavior and breaks tests asserting BUILD** → Update `tests/plan-state.test.mjs` expectations; keep `PI_1C_DEFAULT_MODE`/`--1c-mode` override so users and CI can pin BUILD; call the flip out as BREAKING in the proposal and README.
- **`/reload` drops a newly added export and breaks all tool calls** → D6 namespace + `libCall()` fallback; add a test that the anon path degrades fail-closed when a lib function is missing.
- **Portable pending root differs from where the actual memory pending queue is written** → Resolve the same `$PI_CODING_AGENT_DIR/state/agent-memory/pending` path the shared-context rule already names; add a test asserting no `/mnt/vol_328` or `/home/<user>` literal appears in shipped lib/extension files.
- **Anon fail-closed may block a legitimate new read-only memory tool** → Allowlists are explicit and easy to extend; `*_health` always allowed; behavior is documented so an operator knows to add a tool deliberately.
- **Cursor users assume ASK/ANON protect them** → README + `AGENTS.md` state enforcement is Pi-only; Cursor is prose-only.
- **Two enforcement points diverge over time** → Both call the same `evaluateAnon*` functions in `lib/plan-policy.mjs`; no duplicated verdict logic.

## Migration Plan

1. Land lib changes (`plan-state.mjs`, `plan-policy.mjs`) with new exports; keep old exports working.
2. Wire the extension (`index.ts`): commands, hotkeys, footer, hooks, prompt injection.
3. Update tests; run the package test suite (`tests/run-all.mjs`) green.
4. Update profile docs (`AGENTS.md`, `rules-1c/core/modes.md`, `README.md`, command catalog) in the same change.
5. Rollback: revert the package files and docs; state is backward-compatible because `sanitizeModeState` degrades unknown fields, and a session persisted with `mode: "ask"` read by an old extension falls back to its default.

## Open Questions

- Exact fallback for `PI_CODING_AGENT_DIR` when unset at runtime (profile dir vs `$HOME`): resolvable at implementation time without changing specs or tasks, since the requirement only mandates "no foreign absolute path".
