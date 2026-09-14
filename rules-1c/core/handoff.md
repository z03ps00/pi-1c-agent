# 1C Subagent Handoff Contract

Every delegated 1C subagent must end its final response with **exactly** this heading and valid JSON:

## Upstream Handoff

```json
{
  "task": "...",
  "artifacts": [],
  "findings": [],
  "public_surface": [],
  "locked_decisions": [],
  "constraints": [],
  "unresolved": [],
  "verification": []
}
```

Runtime behavior:

- `subagent_1c` parses and validates the handoff;
- malformed/missing handoff makes the delegated stage fail instead of silently continuing;
- chain/workflow stages receive the previous `## Upstream Handoff` section verbatim;
- `verification` contains only checks actually performed;
- `locked_decisions` must not be casually re-opened downstream;
- `unresolved` must not be hidden.

The handoff is the compact boundary between isolated context windows. It is not optional prose.
