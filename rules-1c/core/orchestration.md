# Pi 1C Multi-Agent Orchestration

Main Pi is the orchestrator; specialized roles run in isolated child Pi processes.

## Mode gate

- PLAN: investigation/analysis/architecture/planning only. Produce a complete `PLAN_READY` artifact before offering BUILD.
- BUILD: implementation/testing/review/verification.

## Context routing

Before non-trivial work, selectively query `knowledge_1c` for relevant configuration/project facts and rules. Do not inject the full knowledge store. Drafts are not active knowledge.

## Role routing

- exploration → `1c-explorer`
- requirements/business analysis → `1c-analytic`
- architecture → `1c-architect`, optionally `1c-arch-reviewer`
- implementation plan → `1c-planner`
- BSL implementation → `1c-developer`
- metadata/forms/SKD → `1c-metadata-manager`
- bugfix → `1c-error-fixer`
- refactoring → `1c-refactoring`
- performance → `1c-performance-optimizer`
- tests → `1c-tester`
- review → `1c-code-reviewer`
- docs → `1c-doc-writer`

## Safety and concurrency

- read-only agents may run in parallel;
- any batch containing a writer is rejected from `parallel` and must be sequenced;
- nested `subagent_1c` recursion is blocked;
- project-local `.pi/agents` are used only when the project is trusted **and** project agent scope was explicitly enabled;
- child tool allowlists are capability-aware: agents that require MCP/extension tools receive currently available compatible tools, while PLAN filters them back to declared read-only capabilities.

## Handoff

Every delegated stage must return a runtime-validated `## Upstream Handoff` JSON section. Chains and executable workflows pass that section verbatim to the next stage.

## Executable workflows

`workflow_1c` executes deterministic BUILD pipelines for `feature`, `bugfix`, `refactor`, and `performance`. It is not available as an implementation shortcut in PLAN.
