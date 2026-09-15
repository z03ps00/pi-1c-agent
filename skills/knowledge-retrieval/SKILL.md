---
name: knowledge-retrieval
description: Retrieve documentation and indexed project knowledge from a connected OpenViking MCP without confusing documents with remembered decisions.
---

# Knowledge Retrieval (OpenViking)

## Purpose

Use OpenViking for source material, documentation, procedures and reports (including the handoff document), not for short behavioural facts/decisions/preferences — those go to Cognee (skill `shared-memory`). Both are permitted write targets per the global memory rule.

Typical content: documentation, requirements, architecture, AGENTS.md, skills, Markdown, API/reference material, indexed project documents, detailed session handoffs.

## Write contract

Same pipeline as Cognee: redact (`lib/redact.mjs`) → `content_hash` after redaction → dedup by `idempotency_key` → write → verify-by-recall. When pairing with a Cognee fact, reuse the same `correlation_id`. Raw transcripts are never stored as decisions; an opt-in `/wrap archive` may store a redacted transcript as a document marked `raw-transcript-document` only.

If a write cannot be verified, queue a redacted pending record and report `UNCONFIRMED`.

## Procedure

1. Inspect available MCP tools and identify the real OpenViking search/read operations.
2. Form a focused query using project + topic + document type when possible.
3. Retrieve the smallest sufficient set of relevant passages/documents.
4. Prefer current/version-matching documents.
5. Compare against current project files when the task is implementation-sensitive.

## Boundary with memory

- "How is the mechanism documented?" → OpenViking.
- "Why did we decide not to use that mechanism?" → Cognee/shared-memory.
- "What did the last session hand off?" → OpenViking (handoff/report) + Cognee (short confirmed facts), joined by `correlation_id` when present.
- "What does the code currently do?" → project files/runtime evidence.

If OpenViking is unavailable, do not fabricate indexed knowledge.
