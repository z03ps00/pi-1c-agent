---
name: shared-memory
description: Recall and store durable cross-agent context using a connected Cognee MCP. Use for previous decisions, confirmed facts, fixes, constraints, preferences, experience, and project state.
---

# Shared Memory (Cognee)

## Mandatory write contract

Do not assume Cognee method names. Inspect the available MCP tools first and use **only the permitted mutating tools**: Cognee `remember` and OpenViking `remember` (Pi may expose them as `memory_remember` / `knowledge_remember`). Dataset is `main_dataset`. Update/delete/merge tools are not permitted: a correction is a **new** record that explicitly supersedes the old one.

If Cognee is not opted in (`memory` missing from `mcp.json`) or not connected, report “memory MCP not in use” **once** and continue with project files. Do not retry. Never simulate a successful recall or write.

Every write follows this order (implemented by `packages/pi-1c-agent/lib/redact.mjs` + `lib/memory-key.mjs` + `lib/memory-write.mjs`):

1. Redact via the shared routine (`memory-safety`).
2. Compute `content_hash` **after** redaction; build `idempotency_key`.
3. Search Cognee / OpenViking / `state/agent-memory/pending` for that key — skip or supersede, never duplicate.
4. Write. Attach a `correlation_id` (mint one when pairing a short Cognee fact with an OpenViking report).
5. Verify by recalling the key. Confirmed → recorded. Failed / offline / no approval → `UNCONFIRMED` + redacted pending record.
6. End the response with one line: `Memory: recalled N / nothing relevant; saved N / UNCONFIRMED / nothing to save`. Anonymous: `Memory: skipped — anonymous`.

Canonical scope is `project:<project-id>` from git remote, `.pi/1c/project-id`, or the normalized repo basename (trailing workspace-path space is stripped).

## Recall

Recall before assuming when prior context can materially affect correctness. Build a narrow query. Do not fetch all memory. Treat recalled memory as historical evidence.

## Remember

Store only confirmed, durable, later-useful items. Allowed types: `fact`, `decision`, `constraint`, `solution`, `experience`, `preference`, `project_state`, `relation`. Before write, apply `memory-safety`.
