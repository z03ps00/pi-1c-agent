## Context

See `proposal.md` for why. This git tree is the Pi profile. Runtime lives in `pi-1c-agent` 0.6.1 (out of this repo). APPLY implements profile files; package-only edits are a follow-up.

Second pass reversed two first-pass mistakes: (1) Docker must **not** be globally forbidden — that was this lab’s AWG overlay baked into the product; (2) the `1c-` prefix is noise in a 1C-only agent — drop it, with aliases and collision guards.

## Goals / Non-Goals

**Goals:**

- Product works on Windows, Linux, and macOS without folders from another PC (`C:/DevopsMoments` and the like).
- Agent may use Docker when the engine is reachable; degrade when it is not.
- Command names match upstream verbs (`/installmcp`, `/doctor`) without a redundant `1c-` prefix.
- Keep 1C coding quality from `ai_rules_1c`.
- Review Comol updates on demand; install only after a PLAN. Register every applied batch.

**Non-Goals:**

- Replacing 1C standards, metadata tools, or the 13 specialist roles.
- A new CFE / infobase change.
- Making Cursor enforce Pi PLAN in this change (document the gap; do not fake a gate).
- Inventing a license for `comol/ai_rules_1c`; only add NOTICE pointing at upstream.
- Auto-pulling `comol/ai_rules_1c` on session start, or running `install.ps1` against this profile.
- Replacing `/updaterules` for downstream 1C *projects*.

## Decisions

### 1. Command names: unprefixed + aliases, collision blocklist

**Choice:** rename prompt files `1c-installmcp.md` → `installmcp.md`. Canonical palette = upstream. Keep `registerCommand("1c-init")` etc. as aliases for one minor. Catalog is `/commands` because Cursor `/help` and Pi examples `/plan` are reserved. `/mode` already exists — do not add `/plan`/`/build` prompts.

**Alternative considered:** drop prefix with no aliases. Rejected: muscle memory and package tests still use `/1c-*`.

### 2. Init merge unchanged (names unprefixed)

`/init` step 0: empty vs from-IB. `/initproject` alias. Prompt keeps the dump procedure so APPLY does not wait on the package TUI.

### 3. Docker: allow + confirm; lab block is opt-in

**Choice:** product default allows `docker`/`podman` after confirm. If `docker ps` (or equivalent) fails, one-shot degrade to printed host commands. Optional `PI_1C_BLOCK_DOCKER=1` or auto-detect (missing socket) for this AWG lab. Remove the always-on overlay paragraph and the unconditional `dockerBlockReason` in 1c-mode (package follow-up).

**Why not “never docker”:** Windows users cannot install the 1C MCP bundle otherwise. `~/mcp-ctl.sh` does not exist on their machines. The bash-only hard-block was also incomplete (`powershell` / `docker.exe` were not covered).

**Alternative considered:** keep the ban and document host scripts only. Rejected by product requirement: the agent must be able to work with Docker.

### 4. Default `mcp.json` is empty of optional servers

No `knowledge` / `memory` / 1C `:8002`–`:8008` until opt-in. Fragments in `mcp.optional/`. `notifyOnStartupConnect: false`.

### 5. Secrets and data MCP

Tilda password stays out of `memory.md`. `1c-data-mcp` is not in `recommended`. NOTICE file for upstream.

### 6. Caveman default `auto`

Schema + skill: empty ≠ “on for reviews”.

### 7. Comol sync is `/review-airules`, merged from `sync-comol-airules`

**Choice:** one maintainer prompt `prompts/review-airules.md`. No `1c-` in the canonical name. `/1c-review-airules` is an alias only. Review is read-only; install is a later `/opsx-apply`. Register = `UPSTREAM-REGISTER.md` + `upstream.lock.json`, seed SHA `410951e74fd3e6b7a763cf49757935b9a34d3f31`. Fetch to temp, do not vendor the clone. Map `content/commands/**` → `prompts/<name>.md` **without** a `1c-` prefix.

**Why not `/updaterules`:** that command is for 1C projects with `.ai-rules.json` / `install.ps1`.

**Why not `/1c-review-airules`:** this profile is 1C-only; the prefix is noise. The older change `sync-comol-airules` used the prefixed name; this change supersedes it.

### 8. APPLY vs package

| Work | Where |
|---|---|
| Prompt rename, mcp.json, AGENTS overlay, skills, README, NOTICE, `/commands`, `/review-airules`, register + pin | This repo |
| `registerCommand("init")` + `"1c-init"` alias; docker hard-block → flag/detect | Package follow-up |

### 9. Full agent test after apply, then fix-retest until green

**Choice:** APPLY ends with a loop: the same agent (or `1c-tester`) walks every capability, writes `verification.md`, and if any required row fails, fixes the files and **re-runs the whole suite**. Stop only when all required rows pass. Grep is necessary but not sufficient.

**Out of the live test:** loading a real IB, purchasing/installing the 1C MCP bundle, writing Tilda passwords, applying a Comol import. Those are inspected as prompts and confirmations only.

**Cross-platform scan:** treat `C:/DevopsMoments` as one known stain; also fail on other absolute machine roots in shipped files (`/home/<user>/`, `/mnt/vol_*` as required paths, `D:\1С_Базы`). `.example` files may show fake paths labeled as examples.

## Risks / Trade-offs

- [Pi palette still lists both `/installmcp` and `/1c-installmcp` during the alias window] → Accept for one minor; then drop aliases.
- [This lab’s Pi still cannot reach docker.sock] → Detect + degrade; do not teach AWG as the product story.
- [Renaming files breaks bookmarks] → Aliases + `/commands`.
- [Two OpenSpec changes would double-apply sync] → the old `sync-comol-airules` change was merged here and removed; APPLY only this change.

## Migration Plan

1. Catalog + `/commands` + file rename with `/1c-*` aliases.
2. Empty default `mcp.json`; installers ask; Docker allow+confirm.
3. Existing clones: `/doctor` offers to keep working memory/1C MCP URLs (no silent deletion).
4. Ship `/review-airules` + seeded register; do not pull GitHub `main` in this APPLY.
5. Agent full test + `verification.md`; on fail, fix and retest the whole suite until required rows pass.
6. Rollback: git revert of the change.

## Open Questions

- Exact `PI_1C_BLOCK_DOCKER` vs sock auto-detect heuristic can be chosen at APPLY (both satisfy the spec).
- Whether package aliases use dual `registerCommand` or a tiny wrapper — package follow-up, does not change the spec.
