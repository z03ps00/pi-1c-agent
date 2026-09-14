# Configuration / Project Knowledge Layer

The knowledge layer supplements BASE `ai_rules_1c`; it does not duplicate the whole base ruleset.

## Scopes and precedence

```text
PROJECT RULES / PREFERENCES
        ↓ override
CONFIGURATION RULES / PREFERENCES
        ↓ constrain interpretation
CONFIGURATION FACTS (fresh + verified first)
        ↓ supplement
BASE ai_rules_1c
```

Facts are descriptive and require evidence for `confidence=verified`. Rules/preferences are normative. Assumptions are provisional and must never silently override a rule or verified fact.

## Storage

Project-local canonical state:

```text
.pi/1c/
├── configuration.json
├── knowledge/
│   ├── fingerprint.json
│   └── items/*.json
├── rules/
│   ├── configuration/*.json
│   └── project/*.json
└── knowledge-drafts/*.json
```

Each item records `kind`, `scope`, `topic`, `statement`, `status`, `confidence`, provenance/evidence, applicability, timestamps and optional configuration fingerprint.

## PLAN / BUILD contract

- PLAN may inspect source and create **draft** proposals only.
- `/1c-config analyze` and `/1c-config update` are PLAN-only discovery operations.
- `/1c-learn` produces a draft; it never silently activates knowledge.
- Canonical apply/disable/configuration initialization requires explicit command in BUILD.
- Drafts live under `.pi/1c/knowledge-drafts/**`, an approved planning-artifact area.

## Retrieval

Do not inject the complete knowledge store into every turn. Query `knowledge_1c` with task/object/subsystem/path terms and load only the top relevant results. If no relevant project/configuration knowledge exists, fall back to BASE rules and source exploration instead of inventing local policy.

## Update / invalidation

Configuration initialization stores a version + fingerprint. Update analysis compares the current source fingerprint with the previous index, identifies changed paths and proposes invalidations for knowledge whose evidence/applicability intersects those paths. The new fingerprint becomes canonical only when the update draft is approved in BUILD.
