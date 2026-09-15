# Changelog

## 0.6.2 (local patch)

- Slash commands are unprefixed. `/1c-*` aliases removed. `/mode` is the only PLAN/BUILD/ASK switch besides Ctrl+Alt+P. Package prompts: `/bugfix`, `/implement`, `/review`.


## Unreleased

### Approval mode (`/approve`)
- `/approve off|safe|strict|status` (no argument opens a picker) and `Ctrl+Alt+S` cycle a BUILD tool-approval gate. Footer shows `approve:off|safe|strict`. Default **off**.
- `safe` prompts on dangerous actions (file writes, destructive bash, MCP/IB mutations). `strict` prompts on every tool call. Dialog: once / all like this (session) / deny. Without UI the would-be prompt is fail-closed.
- Flag `--approve` and env `PI_1C_APPROVE` apply on new sessions; the level is persisted in Pi session state. **Pi-only** — Cursor Auto-run is unchanged.

### Session rotation (opt-in)
- `/session-rotate on|off|status|<percent>` replaces in-place compaction with a handoff plus a fresh session when context usage reaches a threshold. Default **off**, threshold **85** (range 50–95).
- Idle check uses `agent_settled`; `session_before_compact` with `reason === "threshold"` is cancelled once while idle. Overflow and manual `/compact` still run.
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
