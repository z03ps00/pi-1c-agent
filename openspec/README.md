# OpenSpec

Spec-driven development workspace for the Pi 1C agent profile, structured per
the [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) workflow
(OPSX, artifact-guided). Initialized with the official CLI (`openspec init`)
for tools `cursor` and `pi`.

## Directory layout

```
openspec/
├── README.md           # this file
├── config.yaml         # project-level OpenSpec config (schema: spec-driven)
├── project.md          # profile context (this is not a 1C configuration dump)
├── specs/              # source of truth: how the system currently behaves
│   └── <domain>/
│       └── spec.md
└── changes/            # active proposals (one folder per change)
    ├── archive/        # completed changes (created by `openspec archive`)
    └── <change-name>/
        ├── proposal.md
        ├── design.md
        ├── tasks.md
        └── specs/
```

## Slash commands

After a Cursor restart (or Pi `/reload`):

- `/opsx-propose` — create a change and all planning artifacts
- `/opsx-apply` — implement tasks from an approved change
- `/opsx-archive` — merge deltas into `specs/` and archive the change
- `/opsx-explore` — think through ideas without implementing
- `/opsx-sync` / `/opsx-update` — keep specs and planning artifacts coherent

Explore/propose belong to PLAN. Apply requires BUILD.

`/opsx-propose` and every PLAN summary start with 5–8 plain-language lines
(what breaks, where we change it, what the user will verify), then the artifacts.

## Workflow

```
/opsx-propose <idea>   →  /opsx-apply   →  /opsx-archive
```

Agent-side rules: `rules-1c/rules/sdd-integrations.md` and `rules-1c/core/openspec.md`.
