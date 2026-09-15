# 1C primary modes: ASK, PLAN and BUILD

Pi 1C exposes three primary modes. PLAN is a **workflow/state machine**, not merely a tool restriction. ASK is strictly read-only Q&A. BUILD is implementation.

A **new** session starts in **ASK**. Override with `--1c-mode plan|build|ask` (this launch) or `PI_1C_DEFAULT_MODE` (new sessions only). A resumed session keeps its persisted mode; `--1c-mode` still applies for that launch.

Anonymous sessions (`/anon`) are independent of ASK/PLAN/BUILD: switching modes does not reset the anon level. A new session always starts at `anon:off`. Resume keeps the level. Enforcement is **Pi-only** (`1c-mode`); Cursor loads the same texts but does not apply the runtime gates.

## Mode lifecycle

```text
ASK (default)
  ↓ /mode plan | Ctrl+Alt+P
PLAN_DRAFT
  ↓ complete required plan artifact
PLAN_READY
  ├─ Refine → PLAN_DRAFT
  ├─ Stay   → PLAN_READY
  └─ Execute → BUILD_EXECUTING
BUILD_IDLE / BUILD_EXECUTING
  ↓ Ctrl+Alt+P cycles BUILD → PLAN → ASK → BUILD
```

The system prompt carries an authoritative `# Current 1C mode` line on every run. The first run after a switch emits a one-shot `[1C MODE CHANGE]` notice.

### ASK

Read-only research. Answer questions from existing files and read-only tools/MCP. Do **not** emit a PLAN artifact.

- `write` / `edit` are hidden and blocked, including `openspec/**` and `.pi/1c/**` (those roots are PLAN-only).
- `bash` is disabled (same as PLAN).
- If the user asks for a change, explain the approach and point to `/mode plan` or `/mode build` once; then follow the current-mode line.

### PLAN_DRAFT

The agent must continue useful read-only investigation and produce a complete plan even when the eventual task requires new files/folders or code changes.

**Never stop with only** “I cannot create/change this in PLAN; switch to BUILD.” Instead:

1. inspect what already exists when relevant;
2. model future paths/objects without creating them;
3. identify dependencies, risks and verification;
4. emit all required plan sections.

Required sections:

- `## Plan`
- `## Files / objects expected to change`
- `## Risks / edge cases`
- `## Verification`

Only after those acceptance criteria are met does the extension mark the plan `PLAN_READY` and offer BUILD.

### PLAN filesystem policy

Project code and state are protected. Shell execution is disabled. Unknown custom tools are blocked unless classified read-only.

Planning writes are narrowly allowed only under:

- `openspec/**`
- `.pi/1c/plans/**`
- `.pi/1c/knowledge-drafts/**`

These writes are for specification/planning artifacts only. They never permit source-code, metadata, Git, dependency, database or external-system mutation. Symlink traversal is rejected.

### PLAN subagents

Allowed:

- `1c-explorer`
- `1c-analytic`
- `1c-architect`
- `1c-arch-reviewer`
- `1c-planner`
- `1c-code-reviewer`

Writer/execution agents are blocked by runtime policy. Child Pi processes receive only read-only capabilities and cannot recursively invoke `subagent_1c`.

## BUILD

Implementation is allowed. If a `PLAN_READY` artifact exists, `/mode build` moves to `BUILD_EXECUTING` and injects the exact same `plan_id` and plan text. Do not restart full discovery unless new evidence invalidates a plan step.

All writer stages sharing one working tree are sequential. Non-trivial work ends with tests/checks, independent review and verification.

## Anonymous session (`/anon`)

Work without leaving traces in shared agent memory (Cognee/OpenViking) or the local pending queue.

- Surfaces: `/anon 1|2|3|off|status`, `Ctrl+Alt+A` (cycle off → 1 → 2 → 3), `--anon <level>`, env `PI_1C_ANON` (new sessions). Footer always shows `anon:off|1|2|3`.
- `1` — shared memory read-only: block `memory_remember`, `knowledge_remember|write|edit|add_resource`, and writes under `$PI_CODING_AGENT_DIR/state/agent-memory/pending/**`.
- `2` — plus no reads (`memory_recall`, `knowledge_find|search|read|list|tree|grep|glob`); `*_health` stays allowed.
- `3` — plus no handoff documents (`handoffs/**` in the project). A fully ephemeral transcript additionally requires launching with `--no-session`.
- Hard double enforcement in **every** mode, including BUILD: `tool_call` block + MCP adapter `deny`. Unknown `memory`/`knowledge` tools count as writes (fail-closed).
- Post-task memory policy is suspended: end substantial turns with `Memory: skipped — anonymous`. Never claim a blocked write was stored or queued.

## Commands

- `/mode plan`
- `/mode build`
- `/mode ask`
- `/anon 1|2|3|off|status`
- `Ctrl+Alt+P` cycles BUILD → PLAN → ASK
- `Ctrl+Alt+A` cycles anon off → 1 → 2 → 3

The mode, plan artifact and anon level are persisted in Pi session state; PLAN does not need to mutate the project merely to remember a plan.
