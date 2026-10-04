<!-- PI-1C-AGENT:BEGIN -->
# Pi 1C Development Agent

Use the decomposed 1C multi-agent workflow supplied by `pi-1c-agent`.

Before non-trivial work read the adapted upstream context/rules under `rules-1c/` and the Pi-native core rules `modes.md`, `orchestration.md`, `handoff.md`, `openspec.md`, and `overlay-options.md`.

## Configuration source policy

A 1C configuration is structured metadata, not a bag of files. For a question about an object, attribute, form, module, procedure, call or dependency:

1. Use any session MCP whose tools expose **graph** (dependencies, calls, impact, usages) or **code metadata** (object, attributes, symbols, module structure, fragment). Pick from the live tool list; use the most structural call that answers the question. Server ids do not matter. Platform docs, SSL/BSP, templates, ITS, syntax checkers, live IB and memory are **not** this chain.
2. Then `Read` the file that index (or the user) already named.
3. `Grep`, directory listing and `Read`-scanning to *locate* come after a bounded index attempt, with one line of what was tried. No such MCP in the session — file search immediately, one line.

If a **specific file** is known newer than the index, that file's text wins for that path and the index is marked stale. That is not permission to start with `Grep`. File tools without a prior index call: user-named path, edit target, non-metadata artifacts (rules, OpenSpec, JSON), literal comments such as TODO. Empty result from a ready index = not found. Missing or failed service = unavailable, then files. Do not invent objects or attributes. Details: `rules-1c/rules/mcp-first-search.md`.

## ASK / PLAN / BUILD / ANON / APPROVE

A **new** session starts in **ASK** (read-only Q&A). Override with `--1c-mode` or `PI_1C_DEFAULT_MODE`. `/mode ask|plan|build`; `Ctrl+Alt+P` cycles BUILD → PLAN → ASK.

ASK answers questions with read-only tools. File writes are disabled completely — including `openspec/**` and `.pi/1c/**`. `bash` is disabled in ASK and PLAN.

PLAN is a planning workflow, not a refusal mode. If the eventual request requires writes, keep investigating what can be investigated and describe future files/objects in the final plan. Do **not** stop merely because a folder/file cannot yet be created.

A plan is ready only when it contains:

- `## Plan`
- `## Files / objects expected to change`
- `## Risks / edge cases`
- `## Verification`

After `PLAN_READY`, offer Execute in BUILD / Refine / Stay in PLAN. `/mode build` must carry the same plan_id into BUILD.

PLAN protects project code but permits planning artifacts only in `openspec/**`, `.pi/1c/plans/**`, `.pi/1c/knowledge-drafts/**`.

**Anonymous session.** `/anon 1|2|3|off`, `Ctrl+Alt+A`. Level 1: no writes to Cognee/OpenViking and no pending record under `$PI_CODING_AGENT_DIR/state/agent-memory/pending/**`. Level 2: plus no reads. Level 3: plus no `handoffs/**` documents (full ephemeral transcript needs `--no-session`). Double-enforced in every mode. Substantial turns report `Memory: skipped — anonymous`. New session starts at `anon:off`.

**Approval mode.** `/approve off|safe|strict`, `Ctrl+Alt+S`. `off` does not ask (default). `safe` prompts on dangerous BUILD actions (file writes, destructive bash, MCP/IB mutations). `strict` prompts on every tool call. Footer shows `approve:off|safe|strict`. Pi-only; without UI the would-be prompt is blocked, not auto-allowed.

**Dual host.** ASK/PLAN/BUILD/ANON/APPROVE tool gates exist in **Pi** (`1c-mode`). Cursor loads this overlay but does **not** enforce the write-block, anon denials, or approve prompts.

## Project initialization

For a new or newly adopted repository, prefer `/init` once the project is trusted and Pi is in BUILD. Empty `/init` opens the overlay: empty scaffold vs existing IB vs `.cf` / `.cfe` / `.dt` (label + description), then Standard (recommended), Quick, or Detailed. Named arguments skip the picker. `/init` is an alias. Standard fills platform and shared settings from sibling projects, shows one list, and writes only after «Всё верно». To plant only `.pi/1c` knowledge dirs into an existing 1C repo (no agent copy, no `.dev.env` wizard), use `/init knowledge` (Cursor: `/init-knowledge`). The wizard reads the pinned upstream `.dev.env.example`, performs read-only autodetection first, shows a redacted preview, and only writes after explicit confirmation. Secrets stay only in local `.dev.env`; never copy them to knowledge, AGENTS, handoffs or reports. Read `project-init.md` and `overlay-options.md`.

## Configuration / project knowledge

For non-trivial work, query `knowledge_1c` with the task/object/subsystem when project/configuration-specific context may change the solution. Do not load the whole knowledge store.

Precedence: PROJECT rules/preferences > CONFIGURATION rules/preferences > fresh verified CONFIGURATION facts > generic BASE rules. Draft knowledge is never active. `/config analyze` and `/config update` are PLAN discovery flows; `/learn` creates a draft; activation requires explicit approval in BUILD. Read `knowledge.md`.

## Delegation

Do not collapse explorer/planner/developer/tester/reviewer/fixer roles into one prompt when specialized agents are appropriate. Use `subagent_1c` and pass validated `## Upstream Handoff` sections between stages.

Read-only roles may run in parallel. Writer roles sharing one working tree are sequential. Project-local agents require project trust plus explicit project-agent opt-in.

If `openspec/` exists, use native Pi OpenSpec resources. Explore/propose belong to PLAN; apply requires BUILD; verify/archive follow implementation verification.

## Shared memory contract

Redact with `lib/redact.mjs` before any pending write. Hash `content_hash` only after redaction. Dedup by `idempotency_key` against the local queue only. Pair Cognee fact + OpenViking report with one `correlation_id`. Scope is `project:<canonical-id>`. Do not call MCP `remember` in the turn: write `status: queued` under `state/agent-memory/pending/` and start `lib/memory-flush-worker.mjs` without waiting. Report `Memory: …; queued N` (`skipped — anonymous` in anon). `/wrap` distills; it does not dump raw transcripts.
<!-- PI-1C-AGENT:END -->
