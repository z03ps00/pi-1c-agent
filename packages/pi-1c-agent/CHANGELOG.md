# Changelog

## Unreleased

- Pi TUI layer (`1c-ui`): footer, agent hub, command palette (`Ctrl+Shift+K`), overlays — vanilla Pi 0.85 APIs only (`setFooter`, `setWidget`, `custom({overlay})`).
- Russian TUI copy: footer, overlays, palette, `/status`, hub, approval labels, command descriptions. Command verbs (`/mode`, BUILD/PLAN/ASK) stay English.
- Short unique subagent names resolve (`explorer` → `1c-explorer`); the child prompt requires a schema-2 `## Upstream Handoff`.
- `--1c-approve` replaces colliding `--approve` (Pi 0.85 uses `--approve`/`-a` for project trust). `PI_1C_APPROVE` still applies on new sessions.
- Session-start memory reconcile no longer blocks the first BUILD turn; it runs in the background with an 8s budget.
- `/doctor --global` counts installed `agents/1c-*.md` when the upstream snapshot is absent, instead of failing `0/0`.

## 0.7.0 — 2026-09-22

First tagged GitHub release (`v0.7.0`). Includes the unpublished 0.6.2 local-patch surface plus fail-closed runtime hardening.

### Product
- Root README rewritten as a product guide (ASK/PLAN/BUILD, commands, safety, session rotation).
- Automatic session handoff rotation documented.

### Security
- ASK/PLAN tool authorization is fail-closed: only the explicit read-only inventory is allowed. Name fragments such as `get`/`query`/`validate` no longer classify a custom tool as read-only.
- Session distillation sanitizes exact `.dev.env` secrets and known credential families before any remote provider call.
- `/approve safe` treats shell as dangerous unless the command is on a narrow read-only allowlist. Session "approve this risk class" is scoped to tool + risk + target, not the whole `bash` category.
- Child agents inherit an explicit environment allowlist instead of the full parent `process.env`.

### Reliability
- Child stdout/stderr retention copies only a bounded tail and never concatenates an oversize frame.
- Process-tree termination uses a POSIX process group or Windows `taskkill /T`.
- Memory write distinguishes `accepted` (transport ACK) from `recorded` (read-back). Queue reconstruction prefers `done` over `failed`.

### Testing / CI
- Adversarial tool-name, shell-equivalence, secret-egress, bounded-buffer, child-env, and process-supervisor tests.
- `npm run typecheck` parses runtime `.mjs` and extension `.ts` files. CI matrix adds Node 24.

### BREAKING: remaining multi-process runtime gaps
- ASK blocks writer/execution subagents before spawn; ASK children get an ASK mode guard and no `write`/`edit`/`bash`.
- `PI_1C_MAX_SUBAGENTS` is profile-wide across parent Pi processes (filesystem slot leases under `state/runtime/subagents/slots/`).
- Memory ACK is rename-based; a record occupies exactly one of pending/processing/done/failed, including crash windows.
- Knowledge apply stages a transaction then switches `committed.json` / HEAD; lock release requires the owner token.
- Handoff v2 is strict: `schema` must equal 2 and include `runId`, `agent`, `status`, and structured verification. `public_surface` is no longer a required field.
- CI matrix uses `fail-fast: false`; memory tests generate fixtures instead of reading live `state/`.

### BREAKING: fail-closed 1C mode
- Missing or malformed `__PI_1C_MODE__` now resolves to **ASK**, not BUILD. Mutations require an explicit BUILD mode. Duplicate `currentMode()` helpers were removed in favor of `lib/mode-state.mjs`.

### Multi-agent runtime hardening
- Memory pending queue uses atomic `rename` claims (`processing/` + `failed/`), TTL reclaim, and parent-only startup reconcile.
- Child JSON transport flushes a final frame without newline, caps stdout/stderr, and reports structured exit metadata.
- Process-wide `PI_1C_MAX_SUBAGENTS` budget; MCP agents are side-effect classified (unknown MCP cannot run beside other mutators unless `mcpReadOnly: true`).
- MCP session initialize is single-flight; knowledge apply is revision/lock guarded; `.dev.env` values are exact-redacted before remote memory writes.
- GitHub Actions CI (Linux/Windows, Node 22.19 / 22 / 24) plus a nightly stress job.

## 0.6.2 (local patch)

- Slash commands are unprefixed. `/1c-*` aliases removed. `/mode` is the only PLAN/BUILD/ASK switch besides Ctrl+Alt+P. Package prompts: `/bugfix`, `/implement`, `/review`.

### Session capture
- Pi idle/footer no longer treats event context as Cursor: host is Pi when `getContextUsage` or `newSession` is a function. Footer shows `capture:on/stack` (default) instead of `capture:manual`.
- Distill unwraps nested Pi `message` / `toolCall` entries so a real `write`/`edit` counts as substantial and idle `/wrap` can persist.
- Cognee `remember` sends `{ data, dataset_name: main_dataset }` with `TYPE: session_capture`. The report is an OpenViking **document** at `viking://resources/session-captures/<project>/<session>.md` (`write`, not `remember`).
- HTTP adapter initializes the MCP session (plus `notifications/initialized`) before `tools/call` and increments JSON-RPC ids. A `File not found` read is not a verify hit just because the URI is echoed.
- Verify-after-write retries recall/document read with backoff; Cognee verify uses `CHUNKS` by `correlation_id`. Mutating MCP calls use a 30s timeout. `recorded` only when **both** halves confirm.
- `/wrap` notify names the pending half when only the document or only the fact landed. One `correlation_id` is shared by fact, report, and notify.
- Pending filenames include target + content hash so a paired fact and report cannot overwrite each other.
- Default `stack` distiller calls Router AI when a key is present; without a key it falls back to heuristic immediately instead of waiting on Ollama. Heuristic verification requires a `verification:` label.
- Flatten and `distillWithProvider` are called through a namespace import with an inline fallback (same jiti CJS interop as session-rotate).

### Project knowledge layout
- `/init` always plants `.pi/1c/{knowledge,knowledge-drafts,rules}` even when Configuration Knowledge fingerprint is off.
- `/init knowledge` plants that tree into an existing 1C repo without copying the agent, writing `.dev.env`, or creating OpenSpec artifacts. Cursor procedure: `/init-knowledge`.

### Approval mode (`/approve`)
- `/approve off|safe|strict|status` (no argument opens a picker) and `Ctrl+Alt+S` cycle a BUILD tool-approval gate. Footer shows `approve:off|safe|strict`. Default **off**.
- `safe` prompts on dangerous actions (file writes, destructive bash, MCP/IB mutations). `strict` prompts on every tool call. Dialog: once / all like this (session) / deny. Without UI the would-be prompt is fail-closed.
- Flag `--approve` and env `PI_1C_APPROVE` apply on new sessions; the level is persisted in Pi session state. **Pi-only** — Cursor Auto-run is unchanged.

### Session rotation (opt-in)
- `/session-rotate on|off|status|<percent>` replaces in-place compaction with a handoff plus a fresh session when context usage reaches a threshold. Default **off**, threshold **85** (range 50–95).
- Idle check uses `agent_settled`; `session_before_compact` with `reason === "threshold"` is cancelled once while idle. Overflow and manual `/compact` still run.
- Mid-turn guard: when the threshold is crossed during a long turn, `tool_call` blocks further tools with `terminate: true` so the turn settles and rotation runs before Pi's ~94% overflow compaction. The handoff-writing turn is never blocked. Actual `newSession` still happens at idle.
- The mid-turn helpers are called through a namespace import with an inline fallback. Pi loads extensions via jiti (CJS interop); a named import of a newly added `.mjs` export was `undefined` and crashed every `tool_call` with `shouldArmMidTurnRotation is not a function`.
- New session records `parentSession` and continues from `handoffs/handoff-<timestamp>.md` using the existing handoff format.

## 0.6.1

### Product command names and Docker policy
- Canonical Pi commands are `/init` and `/doctor`; `/init` and `/doctor` remain aliases for one release.
- `/init` asks first whether to create an empty source scaffold or dump from an existing infobase / `.cf` / `.dt`.
- `/init` proposes shared non-secret `.dev.env` values from sibling 1C projects one directory up (prefix, developer, platform, …); the user accepts or corrects before remaining variables are asked one by one. Apply still requires explicit confirmation. Secrets are never copied from neighbors.
- `/init` creates `build/{cf,cfe,epf,erf}` for compiled artifacts named `OriginalName_YYYYMMDD`, and `docs/` plus `docs/techtask/` for documentation and raw agent TZs. `build/` is gitignored.
- Bootstrap does not write memory, knowledge, or 1C bundle ports `8002`–`8008` into profile `mcp.json`.
- `/doctor` CORE fails on leftover machine-local paths in shipped files and on a shipped default `mcp.json` that still registers unsolicited optional MCP servers.
- `1c-mode` hard-blocks `docker`/`podman` only when `PI_1C_BLOCK_DOCKER=1` or the engine socket is missing; a reachable Docker Desktop socket allows `docker ps`.

### Standard 1C source scaffold
- `/init` now separates the configuration source root from the shared 1C source-layout root.
- Added standard project directories `cf/`, `cfe/`, `epf/`, and `erf/` under the selected layout root (normally `src/`).
- Existing directories/files are preserved; initialization creates only missing directories.
- Existing `src/cf/Configuration.xml` is detected as configuration root while sibling folders are created under `src/`.
- `EXPORT_PATH` and `EXTENSIONS_PATH` receive layout-aware autodetected proposals.
- Added path-containment guard so scaffold initialization cannot create directories outside the trusted project.
- Added scaffold state to `project.yaml`, `init-state.json`, `/init status`, and `/doctor project`.

## 0.6.0

### Detailed project initialization
- Added `/init`, `/init advanced`, `/init quick`, `/init status`.
- Added a 43-variable UX metadata overlay for the pinned upstream `.dev.env.example`; upstream remains source of truth.
- Added schema-drift detection so new/removed upstream ENV keys are never silently lost.
- Added Configuration.xml/source-root/CompatibilityMode and platform-path autodetection.
- Added redacted pre-apply preview and no project writes before explicit Apply.
- Added secure handling policy for `IB_PASSWORD`, `REPOSITORY_PASSWORD`, and `SUPPORT_KEY`; secrets stay out of project manifest/state/knowledge.
- Added `.dev.env` POSIX mode 0600 and automatic `.gitignore` protection.
- Added `.pi/1c/project.yaml` and `.pi/1c/init-state.json` as non-secret initialization manifests.
- Added optional Configuration Knowledge initialization and OpenSpec onboarding hint.
- Added doctor coverage for project initialization and upstream/schema ENV drift.

## 0.5.0

### Configuration Knowledge Layer
- Added scoped BASE → CONFIGURATION → PROJECT architecture.
- Added canonical facts/rules/preferences/assumptions with provenance, evidence, confidence, version binding and fingerprint.
- Added selective `knowledge_1c` retrieval.
- Added `/config init|status|analyze|update|apply`.
- Added `/learn` draft/approve/reject lifecycle.
- Added `/rule add|list|show|audit|conflicts|disable`.
- Added fingerprint diff and evidence-path invalidation proposals.
- Added approval boundary: PLAN creates drafts; BUILD explicitly activates canonical knowledge.

## 0.4.2 — stabilization after deep audit

- PLAN state machine and correct greenfield planning UX.
- Explicit install/bootstrap contract and pinned upstream.
- Project-agent trust + opt-in.
- Capability-aware child tools, MCP preservation, recursion guard.
- Runtime handoff validation and writer concurrency guard.
- Deterministic `/doctor`.
- OpenSpec planning-write policy.
- Executable `workflow_1c` BUILD pipelines.
