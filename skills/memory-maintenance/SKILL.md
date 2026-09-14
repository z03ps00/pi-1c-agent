---
name: memory-maintenance
description: Maintain shared Cognee memory by detecting duplicates, superseded records, stale project state, and contradictions while preserving useful history.
---

# Memory Maintenance

Use when memory retrieval reveals conflicts/duplicates, after a material decision changes, or during deliberate cleanup.

## Rules

1. Do not delete history merely because it is old.
2. Only the permitted write tools exist (Cognee `remember` / OpenViking `remember`; global memory rule). Corrections are made by writing a **new** record that explicitly supersedes the old one — never by update/delete/merge tools.
3. Express the status **inside** the new record: `CURRENT: …` / `HISTORICAL: … superseded by <newer verified change>`. Do not claim a record was edited or deleted.
4. Duplicates: write one consolidated record and list the superseded keys inside it; do not attempt to remove the originals.
5. Preserve rationale for important architecture decisions.
6. Current files/configuration override remembered operational state.
7. If the supersede write fails or is unconfirmed, say so explicitly (`UNCONFIRMED`); never report a memory correction that did not happen.

## Example

Old: `project:X uses port 9874`.

Current verified config: `9875`.

Desired memory meaning:
- CURRENT: port 9875.
- HISTORICAL: port 9874, superseded by the later verified change.

Never silently choose between contradictions without current evidence.
