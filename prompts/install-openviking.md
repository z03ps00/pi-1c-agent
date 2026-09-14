---
description: "[settings] Install the paired OpenViking + Cognee memory MCP stack (delegates to /install-memory-mcp)"
---

# /install-openviking — our OpenViking (paired with Cognee)

Standalone name for the knowledge half of **our** portable stack. It is **not** in default `mcp.json`. Do not install a different OpenViking image or the upstream Cognee installer.

OpenViking (`knowledge`) is document/knowledge retrieval (`find`, `search`, `read`, `remember`, …). Host port: `127.0.0.1:1933`. Default provider: Router AI. Cognee (`memory` on `127.0.0.1:8001`, dataset `main_dataset`) is installed with it.

Follow `prompts/install-memory-mcp.md` (command `/install-memory-mcp`). If the user only wanted OpenViking, still bring up both servers.

## Disable

Remove the `knowledge` entry from `mcp.json`. Leave `memory` and 1C servers untouched if they were opted in separately.
