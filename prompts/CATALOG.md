# Command catalog

Canonical names have **no** `1c-` prefix. One command per verb — no `/1c-*` aliases. `/init`, `/doctor`, `/session-rotate`, `/memory-flush`, `/wrap`, `/capture-model`, `/mode`, `/anon`, and `/approve` are registered by the Pi `pi-1c-agent` package (not prompt files). Do not add `/help`, `/plan`, `/build`, `/debug`, `/new`, `/login`, `/trust`, `/reload`, `/model`. Modes remain `/mode plan|build|ask`. Anonymous session is `/anon`. Approval mode is `/approve`.

## Everyday (at most twelve)

| Command | Purpose |
|---|---|
| `/commands` | This catalog: everyday first, then settings, then maintainer |
| `/init` | One init wizard (Pi package). Step 0: empty scaffold vs dump from IB / `.cf` / `.dt`. Apply always plants `.pi/1c` knowledge dirs |
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
| `/init-knowledge` | Cursor procedure: plant `.pi/1c` knowledge dirs only (Pi TUI: `/init knowledge`). Does not copy the agent |
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
| `/update-pi-cli` | Update the **Pi CLI shell** (`@earendil-works/pi-coding-agent`) in its npm prefix |
| `/caveman` | Persistent `CAVEMAN` (on\|auto\|off); shipped default `auto` |
| `/session-rotate` | Opt-in Pi-only session rotation at context threshold (default off, 85%) |
| `/wrap` | Capture this dialog now; `/wrap auto on\|off` toggles Pi idle capture (default on) |
| `/memory-flush` | Replay pending Cognee/OpenViking records (confirmed / still-pending / duplicates) |
| `/capture-model` | Distiller: `off` / `stack` / `ollama <model>` / `routerai <model>` / `chat` (default `stack`) |
| `/anon` | Pi anonymous session: `1` no memory writes, `2` no reads, `3` no local traces, `off` |
| `/approve` | Pi approval mode: `off` do not ask, `safe` ask on dangerous BUILD actions, `strict` approve every tool (`Ctrl+Alt+S`) |
| `/theme` | Pi TUI theme: picker, `standard` (VS Code Dark+), `dracula`, `list`, `status` |
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
