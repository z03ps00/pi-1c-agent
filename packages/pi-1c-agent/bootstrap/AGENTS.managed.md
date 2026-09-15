<!-- PI-1C-AGENT:BEGIN -->
# Pi 1C Development Agent

Use the decomposed 1C multi-agent workflow supplied by `pi-1c-agent`.

Before non-trivial work read the adapted upstream context/rules under `rules-1c/` and the Pi-native core rules `modes.md`, `orchestration.md`, `handoff.md`, and `openspec.md`.

## ASK / PLAN / BUILD / ANON

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

**Dual host.** ASK/PLAN/BUILD/ANON tool gates exist in **Pi** (`1c-mode`). Cursor loads this overlay but does **not** enforce the write-block or anon denials.

## Project initialization

For a new or newly adopted repository, prefer `/init` once the project is trusted and Pi is in BUILD. First question: empty source scaffold vs dump from an existing infobase / `.cf` / `.dt`. `/init` is an alias. The wizard reads the pinned upstream `.dev.env.example`, reviews all discovered variables with human explanations, performs read-only autodetection first, shows a redacted preview, and only writes after explicit Apply. Secrets stay only in local `.dev.env`; never copy them to knowledge, AGENTS, handoffs or reports. Read `project-init.md`.

## Configuration / project knowledge

For non-trivial work, query `knowledge_1c` with the task/object/subsystem when project/configuration-specific context may change the solution. Do not load the whole knowledge store.

Precedence: PROJECT rules/preferences > CONFIGURATION rules/preferences > fresh verified CONFIGURATION facts > generic BASE rules. Draft knowledge is never active. `/config analyze` and `/config update` are PLAN discovery flows; `/learn` creates a draft; activation requires explicit approval in BUILD. Read `knowledge.md`.

## Delegation

Do not collapse explorer/planner/developer/tester/reviewer/fixer roles into one prompt when specialized agents are appropriate. Use `subagent_1c` and pass validated `## Upstream Handoff` sections between stages.

Read-only roles may run in parallel. Writer roles sharing one working tree are sequential. Project-local agents require project trust plus explicit project-agent opt-in.

If `openspec/` exists, use native Pi OpenSpec resources. Explore/propose belong to PLAN; apply requires BUILD; verify/archive follow implementation verification.
<!-- PI-1C-AGENT:END -->
