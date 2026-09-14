---
description: Deterministic health check of this Pi 1C profile (CORE trees, MCP opt-in, paths, command names)
---

# /doctor — deterministic profile health check

This is the **only** `/doctor`. It is a deterministic, read-only health check of the **Pi 1C profile** (and the `pi-1c-agent` package when `doctor.mjs` is on PATH). It is not the LLM 1c-rules diagnostic — that is `/doctor-explain`.

Do not modify files, install packages, start containers, or write secrets. If a fix is obvious, report the exact next action instead of applying it.

If `$ARGUMENTS` is `explain`, say that `/doctor-explain` is the LLM diagnostic and continue with this check unless the user clearly wanted only the LLM pass.

## Output format

| Status | Meaning |
|---|---|
| **OK** | Check passed. |
| **WARN** | Work can continue, but something is incomplete or degraded. |
| **FAIL** | CORE is not green. |
| **SKIP** | Not applicable on this host (state why). |

A green CORE result is **impossible** when default `mcp.json` still registers unsolicited memory/knowledge/1C bundle ports, or when a shipped file still binds a foreign PC folder. CORE can still pass when Vanessa Automation MCP is not configured. **FAIL CORE** if a shipped extra skill requires `/home/<user>/`, `/mnt/vol_*`, or `C:/Users/<someone>` as the only working path.

If `doctor.mjs` / `pi-1c-agent` doctor is available, run it and merge its CORE table with the checks below. Missing package doctor is WARN, not an excuse to skip the profile greps.

## Check 1. CORE trees

Confirm these exist under `$PI_CODING_AGENT_DIR` (profile root): `AGENTS.md`, `rules-1c/`, `rules-1c/AGENTS-UPSTREAM.md`, `rules-1c/core/`, `agents/`, `skills/`, `prompts/`, `prompts/CATALOG.md`, `prompts/commands.md`, `prompts/review-airules.md`, `NOTICE`, `upstream.lock.json`, `UPSTREAM-REGISTER.md`.

## Check 1b. Lab extra skill trees (WARN, not CORE)

Confirm these extra trees exist under `$PI_CODING_AGENT_DIR/skills/`: `vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru` (Humanizer must include `knowledge/`). Missing extra = **WARN** (ordinary 1C coding still works) unless the current project opted into that extra and the skill is absent. Vanessa MCP unconfigured is `not configured`, not FAIL. Toolkit HTTP and Humanizer are not MCP failures. Extra trees are not `ai_rules_1c`; `LAB-EXTRAS.md` / `lab-extras.lock.json` should exist after this change.

## Check 2. Command names and collisions

- Everyday catalog is in `prompts/CATALOG.md` / `/commands`. `/review-airules` is maintainer, not everyday.
- No 1C prompt files named `help.md`, `plan.md`, `build.md`, `debug.md`.
- Canonical prompt H1 uses `/installmcp` style, not `/1c-installmcp`.
- `/1c-*` files, if present, are alias stubs.

FAIL if a 1C prompt steals `/help`, `/plan`, `/debug`, `/new`, `/login`, `/trust`, `/reload`, `/model`.

## Check 3. MCP opt-in

Read default `mcp.json` (this profile, not a project `.cursor/mcp.json`):

- `notifyOnStartupConnect` should be `false`.
- `mcpServers` must not contain `knowledge`, `memory`, `cognee-memory`, or 1C bundle URLs on ports `8002`–`8008` unless the user has opted in (those fragments live in `mcp.optional/`).
- Unsolicited default servers → **FAIL CORE**. Tell the user how to remove them or opt in via `/installtools` / `/install-memory-mcp`.
- Report whether Cognee / OpenViking / 1C bundle / Vanessa are opted in. Probe only servers actually present. Optional catalog members absent from `mcp.json` (including Vanessa) are `not configured`, not failures.
- Toolkit ports and Humanizer must **not** appear as MCP servers.

## Check 4. Machine-local paths

Grep shipped files (`prompts/`, `rules-1c/` except `openspec-bundle-reference`, `skills/`, `agents/`, `AGENTS.md`, `README.md`, `settings.json`, default `mcp.json`). Skip this prompt file, `openspec/changes/**`, and `.example` files that label fake paths as examples. **FAIL CORE** if any still contain:

- a foreign PC profile tree such as `Devops` immediately followed by `Moments`
- `C:/Users/<someone>` or `C:\Users\<someone>` as a **required** path (placeholder `%USERPROFILE%` in `.example` files is allowed)
- `/home/<user>/` as a required path
- `/mnt/vol_*` as a required path
- `D:\1С_Базы` as a required path

Allowed: relative paths, `$PI_CODING_AGENT_DIR`, `$HOME` / `%USERPROFILE%` only as labeled examples in `.example` files, and infobase paths that live in a project’s local `.dev.env`.

## Check 5. Docker policy

- Overlay `AGENTS.md` must **not** say the agent must never run docker/podman.
- Report whether `PI_1C_BLOCK_DOCKER` is set (lab hard-block) vs product-allow.
- One non-mutating probe: `docker ps`. Success → Docker allow is OK. Failure → degrade is OK (one message; do not loop).

## Check 6. Caveman default

Shipped `CAVEMAN` empty/invalid = `auto`, not `on` for reviews. Check `rules-1c/rules/dev-standards-env.md` and `skills/caveman/SKILL.md`.

## Check 7. Handoff and NOTICE

Writer agents must require JSON `## Upstream Handoff` (`rules-1c/core/handoff.md`). They must not require markdown `Handoff for the next subagent`. `NOTICE` must exist at the profile root.

## Check 8. Cursor SDK provider (WARN, not CORE)

Read shipped `settings.json` → `packages`:

- **WARN** if the list does not contain the exact string `npm:pi-cursor-sdk`.
- **WARN** if any entry is `npm:pi-cursor-sdk@` plus a version (the pin will not pick up newer npm releases). Next action: change it to unpinned `npm:pi-cursor-sdk` and run `pi install npm:pi-cursor-sdk`.
- **WARN** if the package is not on disk: `pi list` (with `PI_CODING_AGENT_DIR` set) does not show `pi-cursor-sdk`, or `$PI_CODING_AGENT_DIR/npm/node_modules/pi-cursor-sdk/package.json` is missing. Next action: `PI_CODING_AGENT_DIR=$PI_CODING_AGENT_DIR pi install npm:pi-cursor-sdk`. If `pi` is not on PATH, SKIP the on-disk half and still check the specifier.
- A missing Cursor API key / no `cursor` entry in `auth.json` is **not** FAIL CORE and not required for this WARN. Cursor models stay unused until `/login`.
- Do not install the package during `/doctor`. Do not FAIL CORE for this check: DeepSeek remains the default; 1C work can continue.

## After the table

List only actionable fixes. Do not print secrets.
