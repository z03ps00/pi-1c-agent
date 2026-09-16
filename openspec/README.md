# OpenSpec

Spec-driven notes for the Pi 1C agent profile, structured per
[Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec).

## Directory layout

```
openspec/
├── README.md           # this file
├── config.yaml         # project-level OpenSpec config (schema: spec-driven)
├── project.md          # profile context (this is not a 1C configuration dump)
├── specs/              # source of truth: how the system currently behaves
│   └── <domain>/
│       └── spec.md
└── changes/            # local proposals only — not published
```

`openspec/changes/` is a local working directory (see `.gitignore`). Active
proposals, designs and task lists stay on the maintainer machine.

Agent-side rules: `rules-1c/rules/sdd-integrations.md` and
`rules-1c/core/openspec.md`.
