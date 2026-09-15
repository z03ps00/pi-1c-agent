## Context

See `proposal.md` — Why. The shipped install path is already “clone this repo into `$PI_CODING_AGENT_DIR`”. Tracked product files live in git; `auth.json` / `trust.json` are gitignored; `mcp.json` and `settings.json` are tracked but routinely customized on a machine (`/installtools` servers, `<path-to-pi-1c-agent>` substitution). `/updaterules` is a 1C-project installer channel and must stay that. APPLY in this repo is profile files and tests; `pi-1c-agent` `registerCommand` is an optional later follow-up, same split as `/session-rotate`.

## Goals / Non-Goals

**Goals:**

- One settings command whose target is always the loaded profile root, never `cwd` of a 1C project.
- Deterministic git refresh (fast-forward) plus a documented merge of local `mcp.json` / `settings.json` customizations.
- Dual-host: the same prompt is a procedure in Cursor and Pi; Pi ASK/PLAN still must not mutate (the prompt says so; Cursor does not enforce modes).

**Non-Goals:**

- Auto-updating npm packages or Docker MCP images (`/updatemcp` stays the MCP-bundle channel).
- Installing the profile onto a machine that has no clone (README clone steps stay the first-install path).
- Force-syncing `comol/ai_rules_1c` or rewriting `UPSTREAM-REGISTER.md` outside what already arrived in git.
- A new everyday catalog slot.

## Decisions

### 1. Canonical name `/update-profile`, Settings tier

**Choice:** `/update-profile` + one-release `/1c-update-profile`. Settings, not everyday (the everyday “update” slot is `/update1cbase`).

**Alternative considered:** `/self-update`. Rejected: does not match the existing `/update*` family (`/updatemcp`, `/updaterules`, `/update1cbase`) and is easier to confuse with Pi package updates.

### 2. Target resolution: env, then loaded profile root — never project cwd

**Choice:** `$PI_CODING_AGENT_DIR` if set; otherwise the directory of the loaded `AGENTS.md` overlay. Identify a profile by `AGENTS.md` with `PI-1C-AGENT` markers plus `prompts/CATALOG.md` and `rules-1c/`. If that path is missing or is a 1C project (`.ai-rules.json` / `install.ps1` without the overlay markers), stop.

**Alternative considered:** `git rev-parse --show-toplevel` from cwd. Rejected: a user working in a 1C repo would refresh the wrong tree.

### 3. Prompt procedure plus a testable helper

**Choice:** `prompts/update-profile.md` is the command contract the agent follows. The actual fetch/merge lives in a small Node helper (`tools/update-profile.mjs`, Node stdlib + `git` on PATH) so tests can drive a temp clone without asking the model to invent git flags. If Node or the helper is missing, the prompt prints the same git/copy-paste steps and still MUST apply the preserve rules (backup files first). No PowerShell-only path as the product default.

**Alternative considered:** LLM-only `git pull` in the prompt. Rejected: too easy to `reset --hard` a dirty tree or overwrite `mcp.json`.

### 4. Backup → fast-forward → restore merge for tracked local files

**Choice:**

1. Abort unless the tree is a git clone with a usable remote.
2. `git fetch` the default remote.
3. If dirty (tracked) and no confirm argument → stop.
4. If not a fast-forward and no confirm → stop.
5. Copy `mcp.json` and `settings.json` aside.
6. `git merge --ff-only` (default) or `git reset --hard <ref>` only with confirm.
7. Re-apply local MCP servers that are not in the incoming shipped default; restore a local `pi-1c-agent` filesystem path in `packages` if one was present.
8. Leave `auth.json` / `trust.json` / `npm/` / gitignored state untouched.

**Alternative considered:** `git checkout origin/main -- prompts agents skills rules-1c` and never touch `mcp.json`. Rejected: new shipped keys in `settings.json` / default `mcp.json` would never arrive.

**Alternative considered:** `git stash -u`. Rejected: stash of secrets/untracked is surprising; gitignore already protects secrets if we do not use `-u` wipe flags.

### 5. Arguments: empty | status | force

**Choice:** no args = update; `status`/`check` = read-only; `force`/`overwrite` = confirmed hard reset to the default ref. Optional extra token may be a ref (`main`, `v1.2.3`). Do not treat a 1C project path as an argument.

### 6. Redact remotes in output

**Choice:** print `origin` name and redacted URL (`https://github.com/org/repo.git`; strip `user:token@`). Never dump `auth.json`.

### 7. APPLY vs package

| Work | Where |
|---|---|
| Prompt, alias, catalog, doctor WARN, README refresh paragraph, Node helper, contract tests | This repo |
| `registerCommand("update-profile")` | Optional `pi-1c-agent` follow-up; palette already loads `prompts/*.md` |

## Risks / Trade-offs

- Fast-forward refuses a diverged local commit the user meant to keep. **Mitigation:** default stop + list SHAs; only `force` overwrites.
- Merge of `mcp.json` could keep a stale server the shipped default removed on purpose. **Mitigation:** restore only servers that were *extra* vs the *pre-update shipped default* snapshot (servers the user added), not a blind file restore.
- Trailing-space `PI_CODING_AGENT_DIR` (this lab) could miss the clone. **Mitigation:** resolve the env value as given; README already forbids trailing-space folder names; doctor can WARN.
- Pi ASK/PLAN cannot run the helper. **Mitigation:** prompt says switch to BUILD; Cursor users run it as a procedure.
- Fetch needs network/credentials for a private remote. **Mitigation:** surface git’s error; do not retry; do not ask the model to store a token.

## Migration Plan

1. Land prompts, helper, catalog, doctor, README, tests. Existing clones keep working; the command is new.
2. Users with a non-git copy of the profile still use README clone; the command tells them that.
3. Rollback: delete the new prompts and helper; catalog/doctor lines revert. No data migration.

## Open Questions

- Whether `pi-1c-agent` should register `/update-profile` in a later package release — does not change the profile prompt contract.
