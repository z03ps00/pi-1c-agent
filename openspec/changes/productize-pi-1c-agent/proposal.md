## Why

This profile is a working 1C worker toolkit built on `comol/ai_rules_1c`, not a product. A new user gets a 50-command palette with a redundant `1c-` prefix, two overlapping init commands, and `mcp.json` that always tries memory servers and 1C ports. The overlay also **bans Docker globally** because of this lab’s AWG isolation — that is wrong for a product: on a normal machine the agent must be able to run Docker (with confirmation). Missing optional MCP then produces session-long connect errors instead of a quiet degraded mode.

## What Changes

- Split the slash-command surface into **everyday**, **settings**, and **maintainer**. Hide overlap so the palette is usable.
- **BREAKING (palette):** drop the `1c-` prefix from 1C verbs. Canonical names match upstream: `/init`, `/initproject` (alias of from-IB), `/doctor`, `/installmcp`, `/installtools`, `/checkmcp`. Keep `/1c-*` as aliases for one release. Do **not** steal Pi/Cursor reserved names (`/help`, `/plan`, `/debug`, `/new`, `/login`, `/trust`, `/reload`, `/model`). Product catalog command is `/commands`, not `/help`. Keep existing `/mode plan|build`; do not add a second `/plan`.
- **BREAKING (palette):** one init wizard. First question: empty scaffold vs dump from IB / `.cf` / `.dt`. `/initproject` is the from-IB alias.
- **BREAKING (palette):** one `/doctor` — deterministic health check. LLM diagnostic, if kept, is `/doctor-explain`.
- **BREAKING (MCP):** default `mcp.json` does not register Cognee, OpenViking, **or** 1C bundle ports until the user opts in. Ask at install; standalone installers; quiet degrade.
- Add `/install-openviking`. `/checkmcp` is **status-only** by default. Repair may use Docker when Docker works; if the socket is missing (this lab), print host commands instead of looping.
- **Docker is allowed in the product.** Confirm before `docker run`. The AWG hard-block in `1c-mode` and the overlay “never docker” paragraph are lab-only (env or auto-detect), not the shipped default. `~/mcp-ctl.sh` is this machine’s helper, not the Windows path.
- Rewrite hardcoded machine paths (`C:/DevopsMoments` is one example from another PC; the rule is **any** local folder). The shipped agent MUST be cross-platform: Windows, Linux, macOS. Unify JSON `## Upstream Handoff`.
- Second-pass gates folded in: no Tilda passwords in `memory.md`; `1c-data-mcp` anonymous `Выполнить()` is not a product default; caveman default `auto`; license/notice for upstream; Cursor is not Pi PLAN.
- Fold in `sync-comol-airules`: maintainer `/review-airules` (not `/1c-review-airules`) reviews `comol/ai_rules_1c`, never installs in the same turn, then a PLAN; apply later. Register `UPSTREAM-REGISTER.md` + `upstream.lock.json`, seed pin `410951e74fd3e6b7a763cf49757935b9a34d3f31`. `/updaterules` / `/checkupdates` stay for 1C *projects* only.
- **After APPLY the implementing agent MUST run a full test of every change**, then **loop: fix → retest the whole suite** until every required scenario passes. APPLY is not done while any required check is fail, skip-without-reason, or untested.
- Assumption: the reported “1C+.NET vs empty 1C+.NET” pair does not exist. The duplicate is empty `/init` vs from-IB `/initproject`.

## Capabilities

### New Capabilities

- `command-surface`: unprefixed catalog, aliases, init merge, doctor naming, `/commands`, collision-safe names.
- `mcp-lifecycle`: opt-in MCP (memory + 1C bundle), standalone installers, status vs repair, Docker allowed with confirm and degrade.
- `agent-runtime-contract`: graceful MCP degrade, one handoff, **cross-platform paths (no foreign machine folders)**, lab-vs-product Docker, dual-host honesty, secrets, caveman, **full post-apply agent test with fix-retest loop**.
- `upstream-airules-sync`: review-then-plan-then-apply for `comol/ai_rules_1c`, update register, unprefixed `/review-airules`.

### Modified Capabilities

- none (no main specs exist yet)

## Impact

- This git profile: `prompts/` (rename files off `1c-` prefix), `mcp.json`, `AGENTS.md`, `README.md`, skills, `rules-1c/core/*`, `agents/*.md`, `settings.json`, `UPSTREAM-REGISTER.md`, `upstream.lock.json`, `prompts/review-airules.md`.
- Not a 1C CFE: target is the Pi profile, not an extension.
- Package `pi-1c-agent`: `registerCommand("init")` + alias `"1c-init"`; same for doctor; Docker hard-block becomes opt-in/detect. APPLY in this repo does profile files; package is a follow-up.
- Upstream pin of `comol/ai_rules_1c` stays; this change adapts the Pi overlay, it does not replace 1C coding rules.
