---
name: 1c-openspec
description: Integrate OpenSpec spec-driven development with the vanilla Pi multi-agent 1C workflow. Use when an openspec workspace exists or the user asks for proposal/apply/verify/archive workflows.
---

# 1C OpenSpec

Use native OpenSpec support for vanilla Pi.

## Setup

From the project root run the package prompt `/1c-openspec-setup`, or execute:

`node <pi-1c-agent-package>/tools/openspec-setup.mjs --install-cli`

The official OpenSpec initialization must use tool id `pi`, producing `.pi/skills/openspec-*` and `.pi/prompts/opsx-*.md`.

## Workflow

- Explore/propose: combine OpenSpec artifacts with `1c-explorer` and `1c-analytic` evidence.
- Plan: `1c-planner` consumes approved OpenSpec requirements and handoff data.
- Apply: delegate concrete implementation to the appropriate 1C writer agent; do not let the orchestrator become the writer.
- Verify: use `1c-tester`, `1c-code-reviewer`, syntax/static checks and project tests.
- Archive: only after verification is complete or limitations are explicitly marked UNVERIFIED.

If upstream `rules-1c/rules/sdd-integrations.md` exists, follow it in addition to this Pi-native routing rule.
