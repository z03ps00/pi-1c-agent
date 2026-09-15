---
name: 1c-orchestrator
description: Orchestrates specialized 1C subagents in vanilla Pi for feature work, debugging, testing, review, architecture and refactoring.
---

# 1C Orchestrator

Use specialized agents instead of collapsing all responsibilities into one context. First honor the active primary mode from `rules/core/modes.md`, then selectively query `knowledge_1c` when configuration/project context matters, read `rules/core/orchestration.md`, and use `subagent_1c`. PLAN is read-only and permits only planning/read-only subagents; BUILD permits implementation workflows.
