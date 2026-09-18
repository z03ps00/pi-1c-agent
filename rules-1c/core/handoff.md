# 1C Subagent Handoff Contract

Every delegated 1C subagent must end its final response with **exactly** this heading and valid JSON. `schema` must equal `2`. Unlabeled v1 envelopes are rejected.

## Upstream Handoff

```json
{
  "schema": 2,
  "runId": "uuid",
  "agent": "1c-developer",
  "status": "ok",
  "task": "...",
  "artifacts": [],
  "findings": [],
  "locked_decisions": [],
  "constraints": [],
  "unresolved": [],
  "verification": [
    {
      "kind": "syntaxcheck",
      "status": "passed",
      "summary": "..."
    }
  ]
}
```

Runtime behavior:

- `subagent_1c` parses and validates the handoff;
- required identity fields are `schema` (exactly 2), `runId`, `agent`, and `status` (`ok|error|cancelled|blocked`);
- `verification` items are objects with `kind`, `status`, and `summary`, not free-form strings;
- `public_surface` is optional compatibility-only and is not required;
- malformed/missing handoff makes the delegated stage fail instead of silently continuing;
- chain/workflow stages receive the previous `## Upstream Handoff` section verbatim;
- `verification` contains only checks actually performed;
- `locked_decisions` must not be casually re-opened downstream;
- `unresolved` must not be hidden.

The handoff is the compact boundary between isolated context windows. It is not optional prose.
