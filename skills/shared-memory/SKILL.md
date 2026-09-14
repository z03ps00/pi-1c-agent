---
name: shared-memory
description: Recall and store durable cross-agent context using a connected Cognee MCP. Use for previous decisions, confirmed facts, fixes, constraints, preferences, experience, and project state.
---

# Shared Memory (Cognee)

## Mandatory behavior

Do not assume Cognee method names. Inspect the available MCP tools first and use **only the permitted mutating tools**: Cognee `remember` and OpenViking `remember` (Pi may expose them as `memory_remember` / `knowledge_remember`) — see the global memory rule. Dataset is `main_dataset`. Update/delete/merge tools are not permitted: a correction is written as a **new** record that explicitly supersedes the old one.

If Cognee is not opted in (`memory` missing from `mcp.json`) or not connected, report “memory MCP not in use” **once** and continue with project files. Do not retry. Never simulate a successful recall or write. Do not treat a failed write as a task failure. The shipped Cognee is our stack on `127.0.0.1:8001`, not upstream `cognee-memory` on 8010.

## Recall

Recall before assuming when prior context can materially affect correctness.

Build a narrow query from the current task. Prefer keys such as:
- project/repository name;
- subsystem/feature;
- error signature;
- decision topic;
- relevant entity names;
- constraint or workflow concept.

Do not fetch all memory by default.

Prioritize:
1. project-scoped confirmed context;
2. relevant global preferences/workflows;
3. latest records over older superseded records.

Treat recalled memory as historical evidence, not automatically as current truth.

## Remember

Store only information that is:
- confirmed;
- durable beyond the current command/run;
- likely to help a later agent/session;
- concise enough to retrieve usefully.

Allowed memory types:
- `fact`
- `decision`
- `constraint`
- `solution`
- `experience`
- `preference`
- `project_state`
- `relation`

Before write, apply `memory-safety`.

## Suggested normalized record

Use the provider's available schema. When free-form text is accepted, normalize conceptually as:

```text
TYPE: decision
SCOPE: project:<project-id>
SUBJECT: <short subject>
STATUS: current | historical | superseded
CONTENT: <concise confirmed statement>
RATIONALE: <why, when relevant>
EVIDENCE: <file/test/task reference when available>
UPDATED_AT: <timestamp if the provider supports it>
```

Do not invent fields the actual tool schema does not accept.

## Scope

Use `global` only for stable preferences/workflows that should follow the user across projects.

Use `project:<project-id>` for project-specific facts, decisions, fixes, architecture choices, ports, integrations, and state.

Never leak a project-specific fact into another project without an explicit cross-project reason.
