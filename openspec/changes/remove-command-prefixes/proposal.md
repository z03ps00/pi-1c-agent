## Why

The palette listed every 1C verb twice: unprefixed (`/init`) and `/1c-*`. Typing `init` showed about ten hits. The alias window was a one-release compatibility shim; it now doubles noise instead of helping.

## What Changes

- Delete all `prompts/1c-*.md` alias stubs. One prompt file per command.
- `/init` and `/doctor` belong to the Pi package (`registerCommand`). Remove `prompts/init.md` and `prompts/doctor.md` so Pi does not list two `/init` and two `/doctor`.
- In `pi-1c-agent`, register unprefixed commands (`init`, `doctor`, `config`, `learn`, …). Drop `/1c-plan`, `/1c-build`, `/1c-execute-plan` (keep `/mode`). Rename package prompts `1c-debug` → `/bugfix`, `1c-implement` → `/implement`, `1c-review` → `/review`.
- Catalog, `AGENTS.md`, README, `rules-1c/core/*`, and tests assert **no** `/1c-*` aliases.

## Capabilities

### New Capabilities

- none

### Modified Capabilities

- `command-surface`: alias window closed; `/init` and `/doctor` are package-owned.
- `agent-modes`: mode switch is `/mode` only; no `/1c-plan` / `/1c-build` / `/1c-execute-plan`.
- `profile-self-update`: no `/1c-update-profile` alias.
- `profile-test-harness`: contract tests forbid `prompts/1c-*.md`.

## Impact

- This git profile: `prompts/`, `AGENTS.md`, `README.md`, `rules-1c/core/*`, `tests/`, `openspec/`.
- Installed profile `$PI_CODING_AGENT_DIR` (`/mnt/vol_328/Pi/config-1c`): same prompt deletions.
- Package `pi-1c-agent` (portable dist): `registerCommand` names, package prompts, doctor/tests, manifests.
- Cursor has no `/init` TUI after `prompts/init.md` is gone; procedure stays in `rules-1c/core/project-init.md`.
