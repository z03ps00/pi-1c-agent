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
2. If Cognee/OpenViking are opted in, search local `state/agent-memory/{pending,processing,done,failed}` by the idempotency key. Skip remote search before queueing.
3. Queue the short durable result (`target: memory`) and the detailed handoff (`target: knowledge`) as `status: queued` files. Do not call MCP `remember` in the turn. Start the memory-flush worker and do not wait.
4. If they are off, skip memory writes. If the pending file cannot be written, report `UNCONFIRMED` — that is not a task failure.
5. Put an explicit unified `Memory:` status in the final response (`Memory: recalled …; queued …` / `UNCONFIRMED` / `skipped — anonymous` / `not in use` when MCP is off).

`/wrap` (and Pi idle capture) reuse this same handoff field set. They **distill** — they never dump the raw transcript into Cognee or into OpenViking's decision layer. Optional `/wrap archive` stores a redacted transcript as an OpenViking **document** marked `raw-transcript-document` only.

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
