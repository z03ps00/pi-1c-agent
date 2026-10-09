---
description: "[maintainer] Только чтение: сверить comol/ai_rules_1c с этим профилем. В том же ходе ничего не ставить"
---

# /review-airules — review Comol ai_rules_1c for this Pi profile

Maintainer command.

This is **not** `/updaterules`. `/updaterules` / `/checkupdates` update 1C *projects* that use `.ai-rules.json` / `install.ps1`. This command reviews the **Pi 1C profile** against `https://github.com/comol/ai_rules_1c`.

## Hard rules

- **Read-only.** Do not copy files, rewrite `rules-1c/`, `skills/`, `prompts/`, `agents/`, do not run `install.ps1`, do not append `UPSTREAM-REGISTER.md`, do not change `upstream.lock.json`.
- After a non-empty report, **offer** to create an install PLAN. Do not install in this turn.
- New upstream command files, if later applied, land as unprefixed `prompts/<name>.md`, not `prompts/1c-<name>.md`.
- Pi overlay (`rules-1c/core/*`, overlay `AGENTS.md` markers, default `mcp.json` policy) is **skip-by-default** unless the user explicitly includes an item.
- Extra skill trees (`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru`) are **out of scope**. Do not copy, pin, or overwrite them. They are not `ai_rules_1c`.

## Steps

1. Read `upstream.lock.json`. Compared **from-SHA** is `lastAppliedSha`, not a date and not a project `.ai-rules.json` `updatedAt`.
2. Fetch `https://github.com/comol/ai_rules_1c` to a **temp** directory (do not vendor the clone into this profile). Default ref = upstream default branch, or `$ARGUMENTS` if the user named a SHA/tag.
3. `git log <lastAppliedSha>..HEAD --oneline` and `git diff --stat` / `git diff` for `content/commands/**`, `content/skills/**`, `content/rules/**`, `content/agents/**`.
4. If GitHub is unreachable: say the check failed. Do **not** claim the profile is up to date.
5. If `lastAppliedSha` equals the reviewed ref: say there is nothing new to install. Do **not** offer an install plan.
6. Otherwise print the impact report:

   - SHA range (pin → reviewed ref)
   - newest commit subjects
   - each candidate item: copy / adapt / skip
   - matching local paths (`content/commands/foo.md` → `prompts/foo.md`)
   - new dependencies (MCP servers, packages, sibling files)
   - one line: this is the Pi profile, not a 1C project `/updaterules` run

## After a non-empty report

Ask whether to create an install plan (`apply-airules-<sha>` OpenSpec change and/or `.pi/1c/plans/**`). If the user declines: write nothing. If they accept: planning artifacts only. Apply later via `/opsx-apply` or `/execute-plan` with the same plan id. Only that later apply may copy/adapt files, append the register, and advance the pin.

If the user names a subset, the plan contains those items and records the rest of the SHA range as skip candidates.

Acknowledge-and-skip (advance pin with no copies) is also a later apply, not this review.

## Apply discipline (hard-won — the later apply MUST honor this)

These rules exist because a wholesale copy-over breaks the profile. They bind the `/opsx-apply` / `/execute-plan` step, not this read-only review.

1. **Adapt or skip a Pi fork — never wholesale-replace it.** Operational and maintenance command prompts are Pi forks with their own Docker / confirm-target / memory / retry content: `installmcp`, `updatemcp`, `checkmcp`, `installtools`, `deploy-and-test`, `update1cbase`, `loadfrom1cbase`, `restore-testbase`, `build-release`, `install-edt-mcp`, `install-agent-browser`, `install-windows-mcp`, `doctor-explain`, `getconfigfiles`, `initproject`, `check-uuid`, `checkupdates`, `support`, `supportstatus`, `test-fix-loop`, `updaterules`, `review-airules`. Apply only a **surgical** delta to them, or skip. Overwriting one with upstream text loses the Pi fork — a regression even when tests stay green. `/evolve` is a package command in `extensions/1c-context-router`; the LLM-RULES.md procedure is `packages/pi-1c-agent/docs/evolve-ruleset.md`. Do not recreate `prompts/evolve.md`. Overlay switches `/sdlc`, `/litemode`, `/uitests`, `/previewmode`, `/caveman`, `/economymode`, `/rulesmodel` live in `packages/pi-1c-agent/extensions/1c-settings` — do not recreate `prompts/<name>.md` for them; a new model slug goes into `lib/project-settings.mjs`.
2. **A genuinely new upstream command lands as a new file**, unprefixed `prompts/<name>.md`, unless it is a closed option list (then it is a package overlay command like `/sdlc`). It does not overwrite an existing Pi command. Add its row to `prompts/CATALOG.md`.
3. **Keep a compatibility router that still has inbound references.** A file upstream deleted (e.g. `verification-checklist.md`, `dev-standards-core.md`) is removed **only** when nothing in the profile loads it. `verification-checklist.md` is loaded by `rules-1c/openspec-bundle-reference/*` as the Stage 5 gate runner — deleting it leaves dozens of dangling links. When in doubt, keep the router.
4. **No dangling links after any removal.** Before deleting a rule/skill/command, grep the whole profile for its file name (`grep -rn '<name>.md'`); repoint every reference or restore the file. A removal that leaves a broken link is not done.
5. **The register records what was actually done, not the plan.** `UPSTREAM-REGISTER.md` marks each item copy / adapt / skip / keep and must match the tree. Never claim a removal or an update that did not happen. **Never name a lab extra** (`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru`) in the register — a contract test fails on it; refer to them generically or via `LAB-EXTRAS.md`.
6. **Path conventions differ by target.** Rules (`rules-1c/rules/`) and agents (`agents/`) reference each other with **relative** paths; prompts and `openspec-bundle-reference/*` use `$PI_CODING_AGENT_DIR/`. When adapting an upstream body into a rule or agent, strip the `$PI_CODING_AGENT_DIR/` prefix; keep it in a prompt. Rewrite upstream `content/rules|skills|commands|agents/...` into the matching profile path.
7. **Sanitize frontmatter.** Drop upstream-only keys the profile does not use (`globs` / `category` in rules, `argumentHint` / `allowedTools` in prompts). Preserve Pi agent frontmatter (`modelTier`, `tools`, `capabilities`, `sideEffects`, `resources`) and the JSON `## Upstream Handoff` block on pipeline-writer agents.
8. **Preserve Pi invariants with banners, do not drop them:** Docker confirm-before-create; memory stack is Cognee (`memory` :8001) + OpenViking (`knowledge` :1933), not upstream Cognee :8010; ASK/PLAN/BUILD; canonical names have no `1c-` prefix; one command per verb; no prompt file that repeats a package `registerCommand`.
9. **Stay in scope.** Touch only what the plan item covers. Do not reformat `README.md` or unrelated files in the same apply.
10. **Verify before advancing the pin.** `node tests/run-all.mjs` is green except known-environmental failures; `openspec validate <change> --strict` passes; residue scan finds no leftover `content/rules|skills|commands|agents/` paths and no reference to a removed file. Only then move `lastAppliedSha` / `lastReviewedSha` in `upstream.lock.json` and append the register.
