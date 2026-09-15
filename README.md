# pi-1c-agent — Pi 1C profile

Git-tracked Pi 1C agent profile (`PI_CODING_AGENT_DIR`): rules, agents, skills, prompts, MCP settings. Clone it onto Windows, Linux, or macOS. It does not require folders from another PC.

## Dual host (Pi vs Cursor)

ASK/PLAN/BUILD and ANON tool gates exist in **Pi** (`1c-mode`). Cursor loads the same `AGENTS.md` but does **not** enforce the write-block or anonymous denials. `/init` TUI is Pi-only; in Cursor follow `rules-1c/core/project-init.md` as the procedure. Catalog is `/commands` (not Cursor `/help`). `/session-rotate` is an **opt-in Pi-only** alternative to in-place compaction (handoff → new session → continue). It is **off** by default, does not change `settings.json` compaction, and does **not** activate under Cursor.

**BREAKING (Pi startup):** a new session starts in **ASK** (read-only), not BUILD. Pin BUILD with `--1c-mode build` or `PI_1C_DEFAULT_MODE=build`. `/mode ask|plan|build`; `Ctrl+Alt+P` cycles BUILD → PLAN → ASK.

**Anonymous session (Pi):** `/anon 1|2|3|off`, `Ctrl+Alt+A`. Blocks Cognee/OpenViking writes (and reads from level 2) plus `$PI_CODING_AGENT_DIR/state/agent-memory/pending/**`. Level 3 also blocks project `handoffs/**`; a fully empty transcript needs `--no-session`. Footer shows `anon:off|1|2|3`.

## Commands

Canonical names have **no** `1c-` prefix: `/init`, `/initproject`, `/doctor`, `/installmcp`, `/installtools`, `/checkmcp`, `/review-airules`. One command per verb — no `/1c-*` aliases. `/init`, `/doctor`, and `/session-rotate` are registered by the Pi package (no matching `prompts/*.md`). See `prompts/CATALOG.md` and `/commands` (everyday, then settings, then maintainer). The `/` palette lists prompt templates and extension commands only (`enableSkillCommands: false`); skills still load on demand, they are not `/skill:name` entries. Toggle back in `/settings` if needed.

- `/init` — one wizard. First question: empty scaffold vs dump from IB / `.cf` / `.dt`.
- `/initproject` — alias of `/init` from-infobase.
- `/doctor` — deterministic health check. LLM diagnostic is `/doctor-explain`.
- `/review-airules` — maintainer review of `comol/ai_rules_1c` for **this profile**. `/updaterules` / `/checkupdates` stay for 1C *projects*.
- `/update-profile` — refresh **this profile** from the clone’s git remote (`origin`). Not `/updaterules`. Preserves `auth.json`, `trust.json`, opted-in MCP servers, and a local `pi-1c-agent` path. Does not run `pi install`.
- `/session-rotate` — opt-in Pi-only session rotation at a context threshold (default off, 85%). Reuses the `handoff` skill format. Does not change `settings.json` compaction defaults.

## Lab extras (beta)

Vanessa Automation scenarios, Конвертация данных 2/3 (via MCP Toolkit HTTP), and Humanizer RU are **author lab extras**, not `comol/ai_rules_1c`. Vanessa/KD/toolkit are beta and may change. `humanizer-ru` is a snapshot of Comol [`Humanizer_RU`](https://github.com/comol/Humanizer_RU) plus this author’s `knowledge/` overlay — not the English `humanizer` skill and not `/review-airules`.

Skills live in this profile (`skills/vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru`). `/init` asks Vanessa / KD / Humanizer; silence is No. Apply writes **project data** (dirs and `.dev.env` keys for Vanessa/KD) or a **preference flag** (Humanizer) — not a follow-up skill copy into the 1C project. Declined extras can be enabled later (`/install-vanessa-mcp`, extras re-ask, first-use consent) without a full re-init.

Vanessa MCP is a **separate** opt-in family (`mcp.optional/vanessa.json`, `${VANESSA_MCP_URL}`). `recommended` does not preselect it. Toolkit ports and Humanizer are never MCP servers. Refresh extras from the author’s working tree into `$PI_CODING_AGENT_DIR/skills/` and append `LAB-EXTRAS.md` — do not touch `UPSTREAM-REGISTER.md` / `upstream.lock.json`.

## MCP (opt-in)

Default `mcp.json` does not register Cognee, OpenViking, 1C ports 8002–8008, or Vanessa. Ask at `/installtools` or `/install-memory-mcp` (our OpenViking + Cognee pair; not the upstream Cognee installer). Fragments: `mcp.optional/`. Stack: `mcp.optional/memory-stack/`. Example merge: `mcp.example.json` (knowledge + memory + 1C bundle only — Vanessa is not in that example). `notifyOnStartupConnect` is `false`. `/checkmcp` is status-only; repair is explicit. Absent Vanessa = `not configured`.

## Docker

The agent may use Docker when the engine is reachable. Confirm creates. If `docker ps` fails, print host commands once (no loop). Lab-only hard-block: `PI_1C_BLOCK_DOCKER=1`. `~/mcp-ctl.sh` / `~/mcp-host.sh` are this lab’s helpers, not the Windows Docker Desktop path.

## What is inside

| Path | Purpose |
|---|---|
| `AGENTS.md` | Overlay (ASK/PLAN/BUILD/ANON, MCP opt-in, Docker, memory) |
| `rules-1c/` | Adapted 1C rules + `AGENTS-UPSTREAM.md` + `core/` |
| `agents/` | Subagent prompts |
| `skills/` | Profile skills |
| `prompts/` | Slash-command templates (unprefixed) |
| `scripts/` | Host helpers (`update-profile.mjs` refreshes this clone from origin). Not Pi `tools/` — that name triggers a startup deprecation warning |
| `settings.json` | Theme, default model, package list (`<path-to-pi-1c-agent>` placeholder, unpinned `npm:pi-cursor-sdk`) |
| `mcp.json` | Default MCP (empty optional servers) |
| `NOTICE` | Upstream `comol/ai_rules_1c` terms vs this overlay; lab extras vs Humanizer_RU |
| `upstream.lock.json`, `UPSTREAM-REGISTER.md` | Comol pin and apply register |
| `LAB-EXTRAS.md`, `lab-extras.lock.json` | Lab extras snapshot (not the airules pin) |

## What is not in git

* `auth.json` — provider API keys. Copy from `auth.example.json`.
* `trust.json` — trusted project paths. Copy from `trust.example.json`.
* `.dev.env` — per-**project** secrets and infobase paths, never this profile.
* `npm/` / `node_modules` / packed tarballs of Pi packages (including `pi-cursor-sdk`). Install them with `pi install`; do not vendor them here.

## Deploy on another machine

1. Clone into the profile directory. Set `PI_CODING_AGENT_DIR` to that clone (no trailing-space folder names).
2. Copy `auth.example.json` → `auth.json`, `trust.example.json` → `trust.json`.
3. In `settings.json` replace `<path-to-pi-1c-agent>` with the local `pi-1c-agent` package path (or a documented install location).
4. Install the Cursor SDK provider ([fitchmultz/pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk)). Needs **Node.js 22.19+** and **Pi 0.84.0 or later**. From a neutral working directory:

   ```bash
   PI_CODING_AGENT_DIR=<clone> pi install npm:pi-cursor-sdk
   ```

   That downloads **npm latest** at install time. Do not pin a version in git. Maintainers who explicitly want git HEAD may use `pi install https://github.com/fitchmultz/pi-cursor-sdk`; that is not the default.

   Refresh later with the same command — no `settings.json` version bump. If `pi list` still shows `@jiah-liu/pi-cursor-provider`, `pi remove` that package first so only one `cursor` provider remains.

   A Cursor API key is optional. 1C work uses the shipped DeepSeek default until you run `/login`, choose an API key, and pick Cursor. If npm is unreachable, skip this step: `/doctor` WARNs, CORE can still pass, DeepSeek still works.
5. Optional MCP: `/installtools` or standalone installers. Do not copy another machine’s `mcp.json` ports blindly.
6. Check: `/doctor`.
7. Later refresh of **this clone**: `/update-profile` (or `/update-profile status` first). First install stays a clone; this command does not create a new directory. It does **not** auto-update npm — Cursor SDK refresh remains `pi install npm:pi-cursor-sdk`.

## License

See `NOTICE`. Upstream pin: `comol/ai_rules_1c` SHA in `upstream.lock.json`.
