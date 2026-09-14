## 1. Command catalog and unprefixed names

- [x] 1.1 Add `prompts/CATALOG.md` classifying every command as everyday, settings, or maintainer using **unprefixed** canonical names
- [x] 1.2 Add `prompts/commands.md` (`/commands`) that prints everyday first, then settings, then maintainer — do not create `/help`
- [x] 1.3 Rename `prompts/1c-*.md` to unprefixed filenames (`installmcp.md`, `initproject.md`, …) so the palette matches
- [x] 1.4 Keep thin `prompts/1c-*.md` alias stubs (or extension aliases) for one release that point at the canonical command
- [x] 1.5 Prefix maintainer descriptions with `[maintainer]` and settings with `[settings]`
- [x] 1.6 Rewrite H1 titles to `/installmcp` style (no `/1c-` in headings). Do not add `/plan`, `/build`, `/debug`, or `/help` prompt files

## 2. Init and doctor

- [x] 2.1 Make `initproject.md` description start with `Alias of /init from-infobase` and jump to the dump scenario
- [x] 2.2 Document `/init` step 0: empty scaffold vs from IB / `.cf` / `.dt` (prompt and/or README)
- [x] 2.3 Rename LLM diagnostic to `doctor-explain.md`; canonical `/doctor` is the deterministic check
- [x] 2.4 Add target-infobase confirmation to `update1cbase`, `restore-testbase`, `deploy-and-test`, `build-release`

## 3. MCP opt-in

- [x] 3.1 Remove `knowledge`, `memory`, and 1C `:8002`–`:8008` servers from default `mcp.json`; set `notifyOnStartupConnect` to `false`
- [x] 3.2 Add `mcp.optional/` fragments for knowledge, memory, and 1C bundle plus `mcp.example.json`
- [x] 3.3 Add `prompts/install-openviking.md` (ask first; Docker if available; else host commands)
- [x] 3.4 Update `installtools.md`: OpenViking row; `recommended` does not preselect Cognee/OpenViking/data-mcp; `all` still confirms memory
- [x] 3.5 Split `checkmcp.md`: status by default vs explicit `repair`; unconfigured = `not configured`
- [x] 3.6 Document disable: remove one optional fragment without touching other servers
- [x] 3.7 Remove Tilda password / license writes to `memory.md`; point secrets only at local secret files
- [x] 3.8 Warn that `1c-data-mcp` is unauthenticated `Выполнить()` and keep it out of `recommended`

## 4. Docker: allow in product, degrade in lab

- [x] 4.1 Replace the always-on AGENTS.md AWG docker ban with: use Docker when the engine is reachable; confirm creates; if `docker` fails, print host commands once
- [x] 4.2 Rewrite `installmcp` / `updatemcp` / `checkmcp` / `install-cognee` / `install-openviking` to **run** docker after confirm when available — not “never docker”
- [x] 4.3 Document `~/mcp-ctl.sh` / `~/mcp-host.sh` as this lab’s helpers, not the only product path
- [x] 4.4 Package follow-up: `1c-mode` docker hard-block becomes `PI_1C_BLOCK_DOCKER` or socket auto-detect, not unconditional

## 5. Runtime contract

- [x] 5.1 Overlay `AGENTS.md`: recall Cognee/OpenViking only when opted in and connected
- [x] 5.2 Point `agents/*.md` at overlay + `rules-1c/AGENTS-UPSTREAM.md` + `rules-1c/core/*`
- [x] 5.3 Pipeline + writer agents: JSON `## Upstream Handoff` only
- [x] 5.4 `mcp-1c-tools` / context-bootstrap / shared-memory: degrade once when memory MCP is off
- [x] 5.5 MCP-first chains start at servers present in `mcp.json`
- [x] 5.6 Change the shipped `CAVEMAN` default from `on` to `auto` everywhere it is baked in: `rules-1c/rules/dev-standards-env.md` (`Empty / invalid = on` → `auto`), `skills/caveman/SKILL.md` frontmatter description, `rules-1c/AGENTS-UPSTREAM.md`, and any schema/`.dev.env.example` (empty/invalid MUST NOT mean `on` for reviews)
- [x] 5.7 README: Cursor does not enforce Pi PLAN; `/init` is Pi TUI

## 6. Portable paths, docs, notice

- [x] 6.1 Grep shipped files for machine-local roots (`DevopsMoments`, `C:/Users/`, `D:\\`, `/home/pavel`, `/mnt/vol_328` as a required path) and replace with `$PI_CODING_AGENT_DIR` or relative paths
- [x] 6.2 Replace Windows package path in `settings.json` with a documented placeholder (not a real machine folder)
- [x] 6.3 Update README: unprefixed commands, opt-in MCP, Docker allow+degrade, `/init` vs `/initproject`, works on another PC without this lab’s folders
- [x] 6.4 Add NOTICE pointing at `comol/ai_rules_1c` README terms vs this overlay (do not invent a license)

## 7. Verification

- [x] 7.1 Grep: default `mcp.json` has no `knowledge`/`memory`/1C 8002–8008; prompt H1 uses `/installmcp` not `/1c-installmcp`
- [x] 7.2 Grep: overlay does not say the agent must never run docker; install prompts confirm then docker-or-degrade
- [x] 7.3 Grep: no `/help.md` or `/plan.md` 1C prompts; `/commands` exists
- [x] 7.4 Grep: writer agents emit JSON handoff; no required `## Handoff for the next subagent`
- [x] 7.5 Doctor checklist covers unsolicited MCP, **any** leftover machine path (not only `DevopsMoments`), command collision, lab docker-block flag
- [x] 7.6 Grep: `/review-airules` exists; prompt forbids `install.ps1` and register writes during review; `/updaterules` still for projects

## 8. Comol airules review (merged from `sync-comol-airules`)

- [x] 8.1 Add `upstream.lock.json` with source `https://github.com/comol/ai_rules_1c`, `lastAppliedSha` `410951e74fd3e6b7a763cf49757935b9a34d3f31`, `lastReviewedSha` the same, ISO `updatedAt`
- [x] 8.2 Add `UPSTREAM-REGISTER.md` with a baseline entry and append-only / acknowledge-and-skip rules
- [x] 8.3 Add `prompts/review-airules.md` titled `/review-airules`, `[maintainer]`; alias stub `/1c-review-airules` only if aliases are still in the window
- [x] 8.4 Prompt: read pin, fetch Comol to temp, `git log` / `git diff`; no `install.ps1`; overlay skip-by-default; new commands land unprefixed
- [x] 8.5 Prompt: review is read-only; after a non-empty report offer a PLAN (`apply-airules-<sha>` or `.pi/1c/plans/**`); apply later via `/opsx-apply` / `/execute-plan`; then append register and advance pin
- [x] 8.6 Point AGENTS.md / README at `/review-airules` and the register; one-line on `updaterules.md` / `checkupdates.md` that those are for 1C projects
- [x] 8.7 Put `/review-airules` in `prompts/CATALOG.md` maintainer section

## 9. Package follow-up (outside this git tree)

- [x] 9.1 `registerCommand("init")` and `"doctor"` plus `/1c-init` / `/1c-doctor` aliases; update `package-contract.test.mjs`
- [x] 9.2 `/init` TUI first question: empty vs from-IB
- [x] 9.3 Bootstrap does not write memory/knowledge/1C ports into profile `mcp.json`
- [x] 9.4 `doctor.mjs`: fail CORE on machine-local path leftovers (`DevopsMoments` and other absolute user/volume roots) and unsolicited default MCP
- [x] 9.5 Docker `tool_call` hard-block only when flag/detect says so

## 10. Full agent test of all changes (required after apply)

- [x] 10.1 Write `openspec/changes/productize-pi-1c-agent/verification.md` with one row per check: id, what was done, pass/fail/skip+reason
- [x] 10.2 Agent: `/commands` (or prompt read) — everyday vs settings vs maintainer; `/review-airules` in maintainer; no `/help` or `/plan` 1C prompt
- [x] 10.3 Agent: `/doctor` runs; CORE fails if leftover machine paths or unsolicited MCP are still present
- [x] 10.4 Agent: open `/init` / `/initproject` prompts — empty vs from-IB wording; `/1c-initproject` alias text if aliases exist
- [x] 10.5 Agent: default `mcp.json` has no memory/knowledge/8002–8008; `/checkmcp` is status-only (no docker start in this test)
- [x] 10.6 Agent: `installtools` / `install-openviking` / `install-cognee` ask first; `recommended` does not preselect memory; Tilda not written to `memory.md`
- [x] 10.7 Agent: non-mutating `docker ps` — allow or degrade once; overlay does not say “never docker”
- [x] 10.8 Agent: `/review-airules` read-only (or dry-run the prompt): does not write register/pin/skills; `/updaterules` still says it is for 1C projects
- [x] 10.9 Agent: grep handoff JSON required; no required `## Handoff for the next subagent`; caveman default `auto`; NOTICE exists; shipped tree has no foreign PC folders
- [x] 10.10 Agent: destructive IB prompts still require naming the target (inspect only — do not load a base)
- [x] 10.11 If any required row is fail: fix, then **re-run 10.2–10.10 in full**. Repeat until all required rows pass. Skip only with a spec-legal reason (e.g. no Docker socket). Do not mark APPLY complete while any required row is fail or untested.
