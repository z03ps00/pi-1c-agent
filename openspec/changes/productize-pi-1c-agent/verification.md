# Verification — productize-pi-1c-agent

Loop iteration: **2** (2026-09-14). Profile rows remain pass from iteration 1. Package follow-up (4.4, 9.1–9.5) implemented in `~/.pi/packages/pi-1c-agent` and rechecked.

| id | What was done | Result |
|---|---|---|
| 10.2 | Read `prompts/commands.md` + `prompts/CATALOG.md`. Everyday (10 + `/mode`) first; settings; maintainer includes `/review-airules`. No `prompts/help.md` or `prompts/plan.md`. | **pass** |
| 10.3 | `/doctor`: package `doctor.mjs --package-only` CORE PASS. CORE now fails on leftover machine paths and shipped unsolicited MCP; neither is present. | **pass** |
| 10.4 | `prompts/init.md` Step 0 empty vs IB. Package TUI first question: empty scaffold vs dump. `initproject.md` alias of `/init` from-infobase. | **pass** |
| 10.5 | Default profile `mcp.json` has no memory/knowledge/8002–8008. Package bootstrap does not write `mcpServers`. `/checkmcp` status-only. | **pass** |
| 10.6 | `installtools` / `install-openviking` / `install-cognee` ask first. `recommended` does not preselect Cognee/OpenViking/data-mcp. Tilda secrets pointed at `config.env`/`.dev.env`, not `memory.md`. | **pass** |
| 10.7 | Overlay has no “never docker”. `docker ps` succeeded in Cursor (allow). Package `1c-mode` blocks only when `PI_1C_BLOCK_DOCKER=1` or socket missing. Doctor docker policy: `product-allow`. | **pass** (allow) |
| 10.8 | Dry-run `prompts/review-airules.md`: read-only, forbids `install.ps1` and register/pin writes. `/updaterules` says it is for 1C projects. | **pass** |
| 10.9 | Writer agents + `subagent-pipeline.md` require JSON `## Upstream Handoff`. CAVEMAN empty/invalid = `auto`. `NOTICE` exists. No foreign PC folders in shipped profile or package files. | **pass** |
| 10.10 | Inspected only: `update1cbase`, `restore-testbase`, `deploy-and-test`, `build-release` all have “Confirm the target infobase”. Did not load a base. | **pass** |
| 9.1 | Package: `registerCommand("init")` and `"doctor"` plus `/1c-init` / `/1c-doctor` aliases. `package-contract.test.mjs` updated. | **pass** |
| 9.2 | `/init` TUI `select("Источник проекта (первый вопрос /init)", …)` before other questions; `from-ib` sends dump follow-up. | **pass** |
| 9.3 | Bootstrap comment + `bootstrapWritesOptionalMcp` guard; synthetic bootstrap creates no `mcp.json`. | **pass** |
| 9.4 | `doctor.mjs` CORE: shipped machine-local paths, bootstrap MCP inject, package `mcp.json`. `node tests/run-all.mjs` 62/62. `doctor --package-only` CORE PASS. | **pass** |
| 4.4 / 9.5 | `lib/docker-policy.mjs`: hard-block only `PI_1C_BLOCK_DOCKER=1` or missing socket; reachable socket allows `docker ps`. | **pass** |

No required row is fail. Package tests: **62/62**. `doctor --package-only`: CORE PASS.
