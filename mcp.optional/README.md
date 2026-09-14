# mcp.optional — opt-in fragments

Default profile `mcp.json` has an empty `mcpServers` object. Merge **one family** after the user confirms the matching installer:

| Fragment | Server family | Command |
|---|---|---|
| `knowledge.json` + `memory.json` | Our OpenViking + Cognee pair (ports 1933 / 8001, dataset `main_dataset`) | `/install-memory-mcp` (also `/install-cognee` / `/install-openviking`) |
| `1c-bundle.json` | purchased 1C MCP ports 8002–8008 | `/installmcp` |
| `vanessa.json` | Vanessa Automation MCP (separate extra family, **not** the 1C bundle) | `/install-vanessa-mcp` |

Do **not** install the upstream `comol/ai_rules_1c` Cognee MCP. Compose, provider overlays, and `memory-stack.sh` live in `mcp.optional/memory-stack/`.

`mcp.example.json` at the profile root shows a merged shape for **knowledge + memory + 1C bundle only**. It is not the default. It does **not** include Vanessa — Vanessa is a different family (`vanessa.json`, `${VANESSA_MCP_URL}`).

MCP Toolkit HTTP ports (`MCP_TOOLKIT_PORT`, `KD2_PORT`, `KD31_PORT`) and Humanizer RU are **never** MCP servers. Do not register them here.

## Disable one family

Delete that one key (or those keys) from `mcp.json`. Leave other opted-in servers in place. Example: stop using Cognee → remove `memory` only; `knowledge` and 1C bundle stay if they were added separately. Stop Vanessa → remove `vanessaAutomation` only. Stop both memory servers: `/install-memory-mcp disable` (containers stop, data on disk stays).
