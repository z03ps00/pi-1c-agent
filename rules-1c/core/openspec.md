# OpenSpec integration for vanilla Pi

OpenSpec is the project-scoped SDD layer and is complementary to 1C subagents.

## Native Pi artifacts

Initialize with the official OpenSpec `pi` adapter. Expected project resources:

- `openspec/`
- `.pi/skills/openspec-*`
- `.pi/prompts/opsx-*.md`

Do not use Oh My Pi artifacts and do not translate another tool's bundle when native Pi support exists.

## Command palette

Pi discovers project `.pi/prompts/*.md` as slash commands, but only at startup or `/reload`. After OpenSpec
artifacts are installed (on `/1c-init` Apply or `/1c-openspec-setup`) the resources are reloaded automatically; if
`/opsx-*` is still missing, run `/reload` (or restart Pi). `openspec-setup` normalizes the prompt frontmatter to
Pi-supported keys (`description`, `argument-hint`) and keeps the `opsx-propose` plain-language preamble idempotent.

## Mode mapping

| OpenSpec action | Pi 1C mode |
|---|---|
| explore | PLAN |
| propose / planning updates | PLAN; planning writes under `openspec/**` are allowed |
| apply | BUILD required |
| verify | BUILD/verification |
| archive | after verification |

PLAN may write OpenSpec planning artifacts, but must still block project-code/metadata/Git/dependency mutations. `/opsx-apply` is not a loophole around PLAN.

Approved OpenSpec artifacts are locked requirements/handoffs. BUILD should execute them rather than re-running the same approval/discovery cycle without new evidence.

## Human-readable propose

`/opsx-propose` and every PLAN summary start with **5–8 plain-language lines**: what breaks, where we change it,
what the user will verify. Only then the artifacts (proposal/design/tasks/specs). The user must never need the
«объясни проще» follow-up.

## Target container

Before proposing anything, resolve the target container per `extension-targeting.md`: `knowledge_1c` +
`USER-RULES.md` + `.dev.env` (`NEW_OBJECTS_IN`, `EXTENSION_NAME`, `EXTENSION_NAMES`). A proposal must not invent a
new CFE for a change that belongs to an existing extension.
