# 1C primary modes: PLAN and BUILD

Pi 1C exposes two primary modes, but PLAN is a **workflow/state machine**, not merely a tool restriction.

## PLAN lifecycle

```text
BUILD
  ↓
PLAN_DRAFT
  ↓ complete required plan artifact
PLAN_READY
  ├─ Refine → PLAN_DRAFT
  ├─ Stay   → PLAN_READY
  └─ Execute → BUILD_EXECUTING
```

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

Implementation is allowed. If a `PLAN_READY` artifact exists, `/1c-execute-plan` moves to `BUILD_EXECUTING` and injects the exact same `plan_id` and plan text. Do not restart full discovery unless new evidence invalidates a plan step.

All writer stages sharing one working tree are sequential. Non-trivial work ends with tests/checks, independent review and verification.

## Commands

- `/mode plan`
- `/mode build`
- `/1c-plan`
- `/1c-build`
- `/1c-execute-plan`
- `Ctrl+Alt+P` toggles PLAN/BUILD

The mode and plan artifact are persisted in Pi session state; PLAN does not need to mutate the project merely to remember a plan.
