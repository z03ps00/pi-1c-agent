---
description: "[settings] Install the paired OpenViking + Cognee memory MCP stack (delegates to /install-memory-mcp)"
---

# /install-cognee — our Cognee (paired with OpenViking)

This profile does **not** install the upstream `comol/ai_rules_1c` Cognee MCP (no `cognee/cognee-mcp:main` on port 8010, no server id `cognee-memory`). Our variant has priority.

Cognee (`memory`) is the persistent-facts half of the **paired** stack. OpenViking (`knowledge`) is installed with it. Dataset: `main_dataset`. Host port: `127.0.0.1:8001`. Default provider: Router AI.

Follow `prompts/install-memory-mcp.md` (command `/install-memory-mcp`). If the user only wanted Cognee, still bring up both servers; they share one Compose stack.

## Disable

Remove the `memory` entry from `mcp.json`. Do not remove `knowledge` or 1C bundle entries unless the user asked to disable those too. Stopping the container without `docker compose down -v` keeps data.
