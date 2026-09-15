# OpenSpec integration for vanilla Pi

OpenSpec is the project-scoped SDD layer and is complementary to 1C subagents.

## Native Pi artifacts

Initialize with the official OpenSpec `pi` adapter. Expected project resources:

- `openspec/`
- `.pi/skills/openspec-*`
- `.pi/prompts/opsx-*.md`

Do not use Oh My Pi artifacts and do not translate another tool's bundle when native Pi support exists.

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
