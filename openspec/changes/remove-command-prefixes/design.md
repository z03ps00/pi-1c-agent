## Context

The alias window (`prompts/1c-*.md` plus package `registerCommand("1c-init")`) was a one-release shim. Pi loads every `prompts/*.md` as a slash command, so each alias is a second palette row. The package also registered prefixed commands, so `/init` appeared many times.

## Goals / Non-Goals

**Goals:**

- One palette row per verb. No `/1c-*` slash commands.
- `/init` and `/doctor` owned by the Pi package (TUI / `doctor.mjs`).
- `/mode` is the only PLAN/BUILD/ASK switch besides `Ctrl+Alt+P`.

**Non-Goals:**

- Renaming extension folders (`extensions/1c-mode`, `agents/1c-*.md`). Those are not palette commands.
- Cursor `/init` TUI (Pi-only).

## Decisions

### 1. Package owns `/init` and `/doctor`

**Choice:** delete `prompts/init.md` and `prompts/doctor.md`. Cursor follows `rules-1c/core/project-init.md`.

**Alternative considered:** keep prompt files and rename package commands. Rejected: two `/init` in Pi.

### 2. No alias stubs

**Choice:** delete every `prompts/1c-*.md`. Tests fail if any reappear.

### 3. Reserved names

**Choice:** drop `1c-plan` / `1c-build` / `1c-execute-plan`. Rename `1c-debug` → `bugfix` (`/debug` is reserved). `1c-implement` → `implement`, `1c-review` → `review`.

### 4. Dist patch without git source

**Choice:** patch `/mnt/vol_328/Pi/dist/pi-agents-portable-20260913/packages/pi-1c-agent` in place and regenerate SHA manifests. A later package rebuild from an unpatched source will restore prefixes until that source is fixed.
