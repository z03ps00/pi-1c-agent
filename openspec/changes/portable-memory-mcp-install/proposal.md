## Why

The working memory stack (OpenViking `knowledge` + Cognee `memory`) exists only inside a host-specific lab tree (`/mnt/vol_328/MCP/agent-memory` + `~/mcp-ctl.sh memory-up routerai`) with hardcoded paths, an external AWG Docker network (`tunnel_tunnel-net`), lab IPs (`172.19.0.1`, `172.19.0.100`) and a tunnel-reconnect step. None of that ships with the Pi 1C profile, so a second computer cannot reproduce the same two servers with the same models, provider and settings. The profile's own `/install-cognee` / `/install-openviking` prompts describe a *different*, contradictory install (single official `cognee/cognee-mcp:main` on port 8010, no OpenViking pairing, no RouterAI provider), which would produce an incompatible memory store.

## What Changes

- Ship a **portable, profile-owned memory MCP stack** (Compose + rendered configs + provider overlays) so both OpenViking and Cognee come up with one agent command on any machine, independent of the `/mnt/vol_328/MCP` lab tree, the AWG tunnel network and lab IPs.
- Add a **single install/bring-up command** (`/install-memory-mcp`) that provisions both servers together with pinned images, default models, provider and all non-secret settings; only API keys are collected from the user.
- Make **Router AI the default provider** exactly as configured today (Cognee: `hosted_vllm/${ROUTERAI_MODEL}` + `qwen/qwen3-embedding-8b` dim 1024, `reasoning_effort=none`; OpenViking: same RouterAI endpoint + embeddings), and add a **first-class Ollama alternative** with pre-set models (LLM/VLM + `bge-m3` embeddings) that currently exists only half-wired (`render-openviking-config.sh` `local` profile + `local-llm/docker-compose.yml`, with no Cognee overlay).
- **Redirect the profile's `/install-cognee` and `/install-openviking` to our paired stack** and make the guided menu offer *our* OpenViking+Cognee instead of the upstream `comol/ai_rules_1c` Cognee installer; upstream Cognee is explicitly **not** installed (our variant has priority).
- **Audit and fix** the memory/knowledge skills and rules so they match the real exposed tool names, ports, datasets and provider reality (e.g. `mcp.optional/memory.json` / `knowledge.json`, `install-cognee.md`, the shared-memory / knowledge-retrieval / context-bootstrap skills, and the global memory rule).
- Keep secrets (API keys, OpenViking root/client keys) **out of git**; the portable stack reads them from local secret files only.

## Capabilities

### New Capabilities

- `memory-mcp-install`: how the profile ships, installs, brings up, configures the provider/models for, health-checks, and disables the paired OpenViking + Cognee memory MCP stack portably via one command, with Router AI as default and Ollama as the pre-configured alternative, and how it supersedes the upstream Cognee installer.

### Modified Capabilities

- None. Main `openspec/specs/` has no archived capabilities yet (the `mcp-lifecycle` requirements live only in the still-unarchived `productize-pi-1c-agent` change). This change stays consistent with those opt-in / Docker-capability rules but does not restate them as a delta.

## Impact

- New profile-owned assets (proposed): `mcp.optional/` memory stack directory (Compose file, provider overlays for RouterAI + Ollama, OpenViking `ov.conf` template + render script, secret `.example` files, health/bring-up script), plus a new `prompts/install-memory-mcp.md` (and `/1c-*` alias).
- `prompts/install-cognee.md`, `prompts/install-openviking.md`, `prompts/installtools.md`, `prompts/checkmcp.md` (route to the paired portable stack; correct ports 1933/8001, images, dataset `main_dataset`; state upstream-Cognee override).
- `mcp.optional/memory.json`, `mcp.optional/knowledge.json`, `mcp.optional/README.md`, `mcp.example.json` (align tool lists, URLs and docs with the shipped stack).
- Skills `shared-memory`, `knowledge-retrieval`, `context-bootstrap`, `context-router`, `memory-safety`, `memory-maintenance`, `session-handoff` and the global memory rule in `AGENTS.md` (reconcile tool-name references and provider facts).
- Secrets remain in local secret files only (`.dev.env` / `secrets/*.env`), never committed; no default `mcp.json` change (memory stays opt-in).
- Docker/Compose at install time; no change to the DeepSeek default provider of the Pi agent itself or to 1C bundle servers.
