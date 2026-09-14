---
name: session-handoff
description: Summarize significant completed work into a compact, reusable handoff and persist only durable confirmed parts to shared memory.
---

# Session Handoff

Use after significant work, especially when another agent/session may continue it.

## Build a handoff

Capture only verified or explicitly unresolved information:

- objective;
- completed work;
- decisions made;
- files/components changed;
- tests/verification performed;
- unresolved issues;
- known blockers;
- next recommended step.

## Mandatory completion gate

Before the final response for a substantial task:

1. Build the redacted completion summary from the template.
2. If Cognee/OpenViking are opted in, search them and local pending records by the idempotency key. If they are off, skip remote search.
3. Write the short durable result to Cognee and the detailed handoff to OpenViking **only when those servers are opted in and connected**.
4. If they are off, skip memory writes. If a write is unavailable or fails, save a redacted pending record and report `UNCONFIRMED`/`UNVERIFIED` — that is not a task failure.
5. Put an explicit `Memory:` status in the final response (`not in use` when MCP is off).

A durable file/configuration change is always substantial. Only routine Q&A, trivial reads, failed attempts without reusable lessons, and transient output may be marked `not required`.

## Memory write

Do not store the whole transcript or raw tool output.

Extract durable items and pass them through `memory-safety` before writing to Cognee.

Examples of durable items:
- confirmed root cause + fix;
- architecture decision + rationale;
- project constraint;
- unresolved blocker that will matter next session;
- verified project state needed for continuation.

Temporary logs, command output, speculative hypotheses, and verbose step-by-step history stay out of shared memory.
