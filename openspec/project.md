# Project Context

This is the personal Pi 1C agent profile (`PI_CODING_AGENT_DIR`), not a 1C
configuration dump. There is no `Configuration.xml` here.

## Profile

- Name: 1c-pi-profile
- Kind: Pi agent profile (rules, agents, skills, prompts, MCP settings)
- OpenSpec CLI: installed locally (`openspec` on PATH)
- Adapters: Cursor (`.cursor/`), Pi (`.pi/`)

## Layout

- `AGENTS.md` — profile instructions (`PI-1C-AGENT` markers)
- `rules-1c/` — adapted 1C rules and upstream snapshot
- `agents/` — 1C subagent definitions
- `skills/` — profile skills
- `prompts/` — `/1c-*` command templates
- `openspec/` — spec-driven change workspace for this profile

## Notes for AI Agents

- Treat this repo as agent-profile source, not as a 1C infobase project.
- 1C operational parameters stay in each project's `.dev.env`.
- If a task depends on configuration metadata, inspect the target 1C project
  or confirm via MCP. Do not invent metadata names.
- Delivery and extension-targeting rules in `rules-1c/core/` apply when the
  change is about 1C objects in a downstream project, not this profile.
