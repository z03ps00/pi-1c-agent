# Command catalog

Canonical names have **no** `1c-` prefix. One command per verb — no `/1c-*` aliases. `/init`, `/doctor`, `/session-rotate`, `/mode`, and `/anon` are registered by the Pi `pi-1c-agent` package (not prompt files). Do not add `/help`, `/plan`, `/build`, `/debug`, `/new`, `/login`, `/trust`, `/reload`, `/model`. Modes remain `/mode plan|build|ask`. Anonymous session is `/anon`.

## Everyday (at most twelve)

| Command | Purpose |
|---|---|
| `/commands` | This catalog: everyday first, then settings, then maintainer |
| `/init` | One init wizard (Pi package). Step 0: empty scaffold vs dump from IB / `.cf` / `.dt` |
| `/doctor` | Deterministic profile/package health check (Pi package) |
| `/installtools` | Guided installer menu (asks before any MCP install) |
| `/checkmcp` | MCP status only (repair is explicit) |
| `/mode plan` / `/mode build` / `/mode ask` | Pi ASK/PLAN/BUILD switch (not a prompt file; default ASK) |
| `/loadfrom1cbase` | Dump configuration from the configured infobase into the repo |
| `/update1cbase` | Load repository into the named infobase (confirm target) |
| `/deploy-and-test` | Load into the test infobase and optionally run UI tests |
| `/build-release` | Build `.cf` / `.cfe` release artifacts from the git snapshot |

## Settings

| Command | Purpose |
|---|---|
| `/initproject` | Alias of `/init` from-infobase (dump from IB / `.cf` / `.dt`) |
| `/installmcp` | First install of the purchased 1C Docker MCP bundle |
| `/install-memory-mcp` | Opt-in paired OpenViking + Cognee memory stack (Router AI default) |
| `/install-cognee` | Alias path: our Cognee half of `/install-memory-mcp` (not upstream Cognee) |
| `/install-openviking` | Alias path: our OpenViking half of `/install-memory-mcp` |
| `/install-edt-mcp` | EDT plugin MCP (when `USE_EDT=true`) |
| `/install-agent-browser` | Web-client UI testing browser |
| `/install-windows-mcp` | Last-resort Windows desktop UI MCP |
| `/install-vanessa-mcp` | Opt-in Vanessa Automation MCP (lab extra; not everyday) |
| `/updatemcp` | Update an already installed 1C MCP bundle |
| `/checkupdates` | Read-only check of MCP images and **project** 1c-rules |
| `/updaterules` | Update 1c-rules in a **1C project** (`install.ps1`) — not this profile |
| `/update-profile` | Refresh **this Pi profile** from its git remote (`origin`) — not `/updaterules` |
| `/caveman` | Persistent `CAVEMAN` (on\|auto\|off); shipped default `auto` |
| `/session-rotate` | Opt-in Pi-only session rotation at context threshold (default off, 85%) |
| `/anon` | Pi anonymous session: `1` no memory writes, `2` no reads, `3` no local traces, `off` |
| `/litemode` | `VERIFICATION_DEPTH` |
| `/economymode` | Orchestrator economy mode |
| `/rulesmodel` | `AGENT_MODEL` profile |
| `/restore-testbase` | Rebuild the named test infobase from snapshot (confirm target) |
| `/getconfigfiles` | Partial object dump |
| `/check-uuid` | Duplicate UUID check in a dump |
| `/doctor-explain` | LLM 1c-rules diagnostic (not `/doctor`) |

## Maintainer

| Command | Purpose |
|---|---|
| `/evolve` | Propose `LLM-RULES.md` updates from friction signals |
| `/review-airules` | Read-only review of `comol/ai_rules_1c` vs this profile pin |
| `/support` | Support ticket about MCP / ruleset |
| `/supportstatus` | Status of support tickets |
| `/test-fix-loop` | Closed deploy → test → fix loop (opt-in) |
