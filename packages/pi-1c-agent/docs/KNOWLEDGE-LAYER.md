# Configuration Knowledge Layer — design contract

## Canonical distinction

- **fact** — descriptive statement about configuration behavior; `verified` requires evidence.
- **rule** — normative development policy.
- **preference** — softer normative choice.
- **assumption** — provisional hypothesis; lowest precedence.

## Scope

- `configuration` — reusable across customers using this configuration/version family.
- `project` — customer/team/project-specific policy.

Facts are forced to configuration scope. Project-specific observations should be expressed as project rule/preference rather than pretending to be a generic configuration fact.

## Precedence

1. active project rule/preference;
2. active configuration rule/preference;
3. active verified configuration fact;
4. other active configuration facts;
5. assumption;
6. BASE ai_rules_1c.

Higher precedence does not delete lower layers; conflicts are surfaced by audit.

## Provenance

Each item contains:

```json
{
  "id": "project.rule.extensions...",
  "kind": "rule",
  "scope": "project",
  "topic": "extensions",
  "statement": "...",
  "status": "active",
  "confidence": "verified",
  "provenance": {
    "source": "user",
    "evidence": [
      {"type":"user","note":"explicit project policy"}
    ]
  },
  "appliesTo": {
    "configuration": "ERP 2.5",
    "versionRange": "2.5.25.56",
    "subsystems": [],
    "objects": [],
    "paths": []
  },
  "lastVerified": "...",
  "fingerprintAtVerification": "..."
}
```

## Update / invalidation

`configuration.json` + `knowledge/fingerprint.json` bind knowledge to the inspected source tree. `/config update` computes added/removed/modified paths and proposes stale invalidations for items whose evidence/applicability intersects those paths.

The candidate fingerprint is carried inside a draft and becomes canonical only when `/config apply <draft>` is approved in BUILD.

## Learning safety

`/learn` never writes active knowledge. It produces `.pi/1c/knowledge-drafts/*.json`. Approval is a separate explicit BUILD action.

This prevents a transient LLM interpretation from becoming a permanent project rule without review.
