# Command catalog

Canonical names have **no** `1c-` prefix. One command per verb — no `/1c-*` aliases. `/init`, `/doctor`, `/session-rotate`, `/memory-flush`, `/wrap`, `/capture-model`, `/mode`, `/taskmode`, `/anon`, `/approve`, `/sdlc`, `/litemode`, `/uitests`, `/previewmode`, `/caveman`, `/economymode`, `/rulesmodel`, and `/mcpconfig` are registered by the Pi `pi-1c-agent` package (not prompt files). Do not add `/help`, `/plan`, `/build`, `/debug`, `/new`, `/login`, `/trust`, `/reload`, `/model`. Modes remain `/mode plan|build|ask`. Work path is `/taskmode` (empty opens the picker; footer shows the pin). Empty `/init` opens the source overlay (`empty` | `from-ib` | `from-cf` | `from-cfe` | `from-dt`), then the mode overlay for the empty-scaffold path. Empty `/sdlc`, `/litemode`, `/uitests`, `/previewmode`, `/caveman`, `/economymode`, `/rulesmodel`, `/anon`, `/approve`, `/capture-model`, `/session-rotate`, `/mcpconfig` open the same overlay. Anonymous session is `/anon`. Approval mode is `/approve`.

## Everyday (at most twelve)

| Command | Purpose |
|---|---|
| `/commands` | This catalog: everyday first, then settings, then maintainer |
| `/init` | One init wizard (Pi package). Empty call: overlay for empty scaffold vs existing IB vs `.cf` / `.cfe` / `.dt` (label + description). Then Standard / Quick / Detailed overlay. Apply plants `.pi/1c` knowledge dirs |
| `/doctor` | Deterministic profile/package health check (Pi package) |
| `/installtools` | Guided installer menu (asks before any MCP install) |
| `/checkmcp` | MCP status only (repair is explicit) |
| `/mode plan` / `/mode build` / `/mode ask` | Pi ASK/PLAN/BUILD switch (not a prompt file; default ASK) |
| `/taskmode` | Pi package: picker for docs-fix / spec-authoring / analytics / quick-fix / full-cycle / auto (footer pin; not `/mode`) |
| `/resume` | Continue an active task from its handoff after checking workspace state and evidence |
| `/loadfrom1cbase` | Dump configuration from the configured infobase into the repo |
| `/update1cbase` | Load repository into the named infobase (confirm target) |
| `/deploy-and-test` | Load into the test infobase and optionally run UI tests |
| `/build-release` | Build `.cf` / `.cfe` release artifacts from the git snapshot |

## Settings

| Command | Purpose |
|---|---|
| `/initproject` | Alias of `/init` from-infobase. Existing IB, or `.cf` / `.cfe` / `.dt`: ask before creating a file IB and dumping to `src/`; «нет» still runs ordinary `/init`. After «да» — bases catalog, folder name, then dump |
| `/init-knowledge` | Cursor procedure: plant `.pi/1c` knowledge dirs only (Pi TUI: `/init knowledge`). Does not copy the agent |
| `/installmcp` | First install of the purchased 1C Docker MCP bundle |
| `/install-memory-mcp` | Opt-in paired OpenViking + Cognee memory stack (Router AI default) |
| `/install-edt-mcp` | EDT plugin MCP (when `USE_EDT=true`) |
| `/install-agent-browser` | Web-client UI testing browser |
| `/install-windows-mcp` | Last-resort Windows desktop UI MCP |
| `/install-vanessa-mcp` | Opt-in Vanessa Automation MCP (lab extra; not everyday) |
| `/updatemcp` | Update an already installed 1C MCP bundle |
| `/checkupdates` | Read-only check of MCP images and **project** 1c-rules |
| `/updaterules` | Update 1c-rules in a **1C project** (`install.ps1`) — not this profile |
| `/update-profile` | Refresh **this Pi profile** from its git remote (`origin`) — not `/updaterules` |
| `/update-pi-cli` | Update the **Pi CLI shell** (`@earendil-works/pi-coding-agent`) in its npm prefix |
| `/caveman` | Pi package: picker for `CAVEMAN` (on\|auto\|off, shipped default `auto`) and session lite\|full\|ultra |
| `/session-rotate` | Pi package: picker on\|off; threshold stays `/session-rotate 80` |
| `/wrap` | Capture this dialog now; `/wrap auto on\|off` toggles Pi idle capture (default on) |
| `/memory-flush` | Start the background worker for pending Cognee/OpenViking records (does not wait for MCP) |
| `/capture-model` | Pi package: picker off\|stack\|chat\|ollama\|routerai (ollama/routerai ask for a model) |
| `/anon` | Pi package: picker 1\|2\|3\|off (`Ctrl+Alt+A` cycles) |
| `/approve` | Pi package: picker off\|safe\|strict (`Ctrl+Alt+S` cycles) |
| `/theme` | Pi TUI theme: picker, `standard` (VS Code Dark+), `dracula`, `list`, `status` |
| `/litemode` | Pi package: picker for `VERIFICATION_DEPTH`; lite also sets `UI_TESTING=off` |
| `/sdlc` | Pi package: picker for SDLC QA profile (`lite` / `standard` / `full`) |
| `/uitests` | Pi package: picker for UI testing + test-client window |
| `/previewmode` | Pi package: picker for `METADATA_PREVIEW` (on\|auto\|off\|once) |
| `/economymode` | Pi package: picker for orchestrator economy; `models` / `rtk` stay arguments |
| `/rulesmodel` | Pi package: picker for `AGENT_MODEL` profile |
| `/mcpconfig` | Pi package: picker local or global. Add or remove one server in `.pi/mcp.json` or profile `mcp.json`. Empty opens the overlay. `/reload` after a write |
| `/setupmcp` | Wire already-installed MCP servers and memory providers into this repo |
| `/install-atlassian-mcp` | Opt-in: `mcp-atlassian` (Jira / Confluence) |
| `/install-officecli` | Opt-in: OfficeCLI (Word / Excel / PowerPoint without MS Office) |
| `/install-rtk` | Opt-in: `rtk` shell-output compression proxy |
| `/installfilesupdatescript` | Create an IB→MCP XML export script + Windows Task Scheduler job |
| `/restore-testbase` | Rebuild the named test infobase from snapshot (confirm target) |
| `/getconfigfiles` | Partial object dump |
| `/check-uuid` | Duplicate UUID check in a dump |
| `/doctor-explain` | LLM 1c-rules diagnostic (not `/doctor`) |
| `/groups` | Section browser (`Ctrl+Alt+G`). Inserts a command and does not run it |
| `/layout-view` | Static HTML sketch of a managed form or spreadsheet template |
| `/reglog` | Recent registration-log rows. Fixed read query; limit, window, and level only |
| `/ext-plan` | Dry plan for a vendor update through an extension |
| `/config` | Configuration knowledge: init, status, analyze, update, apply |
| `/learn` | Draft a fact or rule. Empty call opens the overlay. Approve only in BUILD |
| `/rule` | List, show, audit, or disable a knowledge rule |
| `/status` | Mode, project, memory, and agents |
| `/agents` | Subagent hub |

## Maintainer

| Command | Purpose |
|---|---|
| `/evolve` | Package command: draft skill/rule/workflow/prompt, or the LLM-RULES.md pass (`ruleset`, `note`, `show`) |
| `/learning` | Package command: `off` / `safe` / `auto`. Empty call opens the overlay. Pi reviews a finished BUILD turn |
| `/ponytail-review` | Read-only simplification review of the current diff / selected files |
| `/review-airules` | Read-only review of `comol/ai_rules_1c` vs this profile pin |
| `/support` | Support ticket about MCP / ruleset |
| `/supportstatus` | Status of support tickets |
| `/test-fix-loop` | Closed deploy → test → fix loop (opt-in) |
