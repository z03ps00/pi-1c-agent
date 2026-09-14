---
name: knowledge-retrieval
description: Retrieve documentation and indexed project knowledge from a connected OpenViking MCP without confusing documents with remembered decisions.
---

# Knowledge Retrieval (OpenViking)

## Purpose

Use OpenViking for source material, documentation, procedures and reports (including the handoff document), not for short behavioural facts/decisions/preferences — those go to Cognee (skill `shared-memory`). Both are permitted write targets per the global memory rule (OpenViking `remember` / Cognee `remember`). Host: `127.0.0.1:1933` when using the shipped stack.

Typical content:
- documentation;
- requirements and specifications;
- architecture;
- AGENTS.md;
- Skills;
- Markdown;
- API/reference material;
- indexed project documents.

## Procedure

1. Inspect available MCP tools and identify the real OpenViking search/read operations.
2. Form a focused query using project + topic + document type when possible.
3. Retrieve the smallest sufficient set of relevant passages/documents.
4. Prefer current/version-matching documents.
5. Compare against current project files when the task is implementation-sensitive.

## Boundary with memory

Question: "How is the mechanism documented?" -> OpenViking.

Question: "Why did we decide not to use that mechanism?" -> Cognee/shared-memory.

Question: "What did the last session hand off?" -> OpenViking (handoff/report documents) + Cognee (short confirmed facts).

Question: "What does the code currently do?" -> project files/runtime evidence.

If OpenViking is not in `mcp.json` or not connected, note that once and do not fabricate indexed knowledge. Continue with project files.
