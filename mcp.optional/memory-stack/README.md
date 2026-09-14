# Portable memory MCP stack (OpenViking + Cognee)

Ships with this profile. One script brings both servers up on loopback:

```bash
# Router AI (default) — put ROUTERAI_API_KEY in secrets/routerai.env first
./scripts/memory-stack.sh up

# Local Ollama alternative (pre-set qwen3.5:9b + bge-m3)
./scripts/memory-stack.sh up ollama

./scripts/memory-stack.sh status
./scripts/memory-stack.sh down    # keeps ./data
```

Agent command: `/install-memory-mcp`. Do not use the upstream `comol/ai_rules_1c` Cognee installer.

| Server | Host | MCP | Dataset |
|---|---|---|---|
| OpenViking `knowledge` | 127.0.0.1:1933 | `/mcp` | — |
| Cognee `memory` | 127.0.0.1:8001 | `/mcp` | `main_dataset` |

Images are digest-pinned in `compose.yml`. Tag fallbacks: `defaults.env` (`OPENVIKING_IMAGE_TAG_FALLBACK`, `COGNEE_IMAGE_TAG_FALLBACK`). Switching Router AI ↔ Ollama requires a vector reindex; do not hot-swap.
