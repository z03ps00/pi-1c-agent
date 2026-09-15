---
description: "[maintainer] Read-only review of comol/ai_rules_1c against this profile pin; never install in the same turn"
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
