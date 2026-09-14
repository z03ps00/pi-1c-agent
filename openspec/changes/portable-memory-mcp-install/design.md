## Context

See `proposal.md` — Why. This section records the concrete current state discovered during the audit, because the portability approach is shaped by it.

**Where memory really lives today (outside this repo):** `/mnt/vol_328/MCP/agent-memory`:
- `compose.yml` — `openviking` (`ghcr.io/volcengine/openviking@sha256:…`, ports `1933`) + `cognee` (`cognee/cognee-mcp@sha256:…`, container port `8000` → host `8001`). Both attach to external network `tunnel_tunnel-net` and publish on `127.0.0.1` **and** `172.19.0.1` (AWG). Cognee volumes `data/cognee/{system,data}`, `COGNEE_MCP_AGENT_SCOPED=false`.
- `compose.routerai.yml` — provider overlay: Cognee `LLM_MODEL=hosted_vllm/${ROUTERAI_MODEL}`, `LLM_ENDPOINT=https://routerai.ru/api/v1`, `LLM_ARGS={"reasoning_effort":"none"}`, `EMBEDDING_MODEL=hosted_vllm/qwen/qwen3-embedding-8b`, `EMBEDDING_DIMENSIONS=1024`, `DB_PROVIDER=sqlite`, `VECTOR_DB_PROVIDER=lancedb`, `GRAPH_DATABASE_PROVIDER=ladybug`, auth off, `COGNEE_SKIP_CONNECTION_TEST=true`, profile label `com.mcp.agent-memory.profile: routerai`.
- `scripts/render-openviking-config.sh` — renders `data/openviking/ov.conf` from `config/openviking/ov.conf.template`. Supports profiles `local` (Ollama: VLM `ollama/qwen3.5:9b` @ `172.19.0.100:11434`, embeddings `bge-m3:latest`), `openrouter`, and `routerai` (VLM+embeddings via Router AI, `qwen/qwen3-embedding-8b`, dim 1024, encoding `float`).
- `secrets/{routerai,openrouter,openviking-root,openviking-client}.env` (mode 0600, git-ignored), plus scripts `smoke-test.sh`, `backfill`, `replay-pending`, `offload-memory`, `backup`, `restore`.
- Orchestration is `~/mcp-ctl.sh memory-up routerai` (lab-only): it renders the OpenViking config, `docker compose -f compose.yml -f compose.routerai.yml up -d`, waits on `172.19.0.1` health, **reconnects the AWG tunnel** (`tunnel-tc-cognee-1` probe), and **provisions the OpenViking client key** against `MEMORY_ADMIN_URL=172.19.0.1:1933`.
- `local-llm/docker-compose.yml` runs Ollama (`ollama/ollama:latest`, static IP `172.19.0.100`, AWG proxy env), but nothing wires it into `memory-up`; `mcp-ctl.sh` accepts only `routerai` and the README says the Ollama/openrouter profiles were removed.

**What this repo ships today:** only `mcp.optional/{memory,knowledge}.json` (client fragments to `${MEMORY_MCP_URL}` / `${KNOWLEDGE_MCP_URL}`) and `prompts/install-cognee.md` / `install-openviking.md`. The Cognee prompt describes an unrelated official `cognee/cognee-mcp:main` single container on port **8010** with `remember/recall/forget` — contradicting the real port 8001, the OpenViking pairing, and the Router AI provider. There is no Compose, no provider defaults, and no bring-up command in the profile.

**Constraints:** memory must stay opt-in (per the unarchived `mcp-lifecycle` requirements); Docker is a product capability, not a ban; secrets never enter git; the Pi agent's own default provider (DeepSeek) is unchanged.

## Goals / Non-Goals

**Goals:**
- A profile-owned, self-contained memory stack that `docker compose up`s both servers on any machine from one command, with Router AI defaults reproduced exactly and Ollama as a wired alternative.
- Split the reproducible, portable parts (Compose, provider overlays, config template + render, `.example` secrets, health/bring-up script, install prompt) from the lab-only parts (AWG tunnel reconnect, `172.19.0.*` binds, LAN publishing, `/mnt/vol_328` paths).
- Make `/install-cognee`, `/install-openviking`, `/installtools` truthful and route to this stack; explicitly override the upstream Cognee installer.
- Reconcile skills/rules with the real tool/port/dataset/provider facts.

**Non-Goals:**
- Re-authoring the lab `mcp-ctl.sh` menu or its LAN/tunnel/backfill features (they stay lab-only; the portable script is a minimal subset).
- Changing the Pi agent's default model/provider (DeepSeek) or default `mcp.json` (memory stays opt-in).
- GPU provisioning for Ollama or shipping model weights; only pre-set model names + pull guidance.
- Migrating or moving existing lab data.

## Decisions

**D1. Portable stack lives under the profile, parameterized by env, not hardcoded paths.**
Ship `mcp.optional/memory-stack/` (name TBD in tasks) with `compose.yml` plus overlays `compose.routerai.yml` and `compose.ollama.yml`. Replace external `tunnel_tunnel-net` + `172.19.0.1` publishing with a stack-local network and loopback-only host binds by default (`127.0.0.1:1933`, `127.0.0.1:8001`), data under a configurable root (default relative `./data`). *Alternative considered:* symlink/point at `/mnt/vol_328/MCP` — rejected, that is exactly the non-portable coupling we remove.

**D2. Provider selection via Compose overlay + rendered `ov.conf`, defaulting to Router AI.**
Keep the two-file Cognee pattern (`compose.yml` + `compose.<provider>.yml`) and the OpenViking `render-openviking-config.sh` approach, since they already encode the exact working Router AI settings. Default provider is `routerai`. *Alternative:* one big `.env` with conditionals — rejected; overlays keep the working RouterAI file intact and make Ollama an additive file.

**D3. Ship Ollama as a real, paired option.**
OpenViking already has an Ollama (`local`) branch in the render script; add the missing **Cognee** Ollama overlay (`compose.ollama.yml`: `LLM_PROVIDER=ollama`/LiteLLM route, an Ollama embedding model, matching dimensions) and optionally include the Ollama container via an overlay so `--provider ollama` brings up LLM + both memory servers together. Pre-set model names come from the audit (`qwen3.5:9b` VLM, `bge-m3` embeddings) but are re-validated in tasks. *Trade-off:* embedding dimension differs between `qwen3-embedding-8b` (1024) and `bge-m3`; switching providers requires a reindex, so the design treats provider choice as install-time, not hot-swappable.

**D4. Minimal portable bring-up script, not the lab menu.**
Provide one script (invoked by `/install-memory-mcp`) that: renders `ov.conf` for the chosen provider, `docker compose … up -d`, waits for both `/health` on loopback, and provisions the OpenViking client key against the **local** admin URL. It deliberately omits the AWG tunnel reconnect and LAN publishing. Lab hosts keep using `~/mcp-ctl.sh`; the portable script is what ships. *Alternative:* port the whole `mcp-ctl.sh` — rejected as over-scoped and lab-coupled.

**D5. One install command, secrets-only prompts.**
`/install-memory-mcp` (with `/1c-install-memory-mcp` alias) is the single entry; `/install-cognee` and `/install-openviking` delegate to it (they no longer describe divergent installs). It asks only for the provider API key (RouterAI default) or selects Ollama (no key). `/installtools` offers *our* stack in the Cognee/OpenViking rows and never installs upstream Cognee.

**D6. Client fragments and docs track the shipped ports/tools.**
Align `mcp.optional/{memory,knowledge}.json`, `mcp.optional/README.md`, and `mcp.example.json` so `MEMORY_MCP_URL`/`KNOWLEDGE_MCP_URL` and the include/exclude tool lists match what the servers expose (Cognee `remember`/`recall`/…, OpenViking `find`/`search`/`read`/…). Memory remains absent from default `mcp.json`.

**D7. Skills/rules audit is part of the change, verified against the running stack.**
Walk the seven memory/knowledge skills and the global memory rule; fix any wrong server/port/dataset/tool-name reference (e.g. the `install-cognee` port `8010` vs `8001`, `main_dataset`, and the `memory_remember`/`knowledge_remember` vs exposed `remember` naming). Corrections are checked against the actually exposed tools.

## Risks / Trade-offs

- **[Digest-pinned images unavailable / arch mismatch on another machine]** → allow a documented tag fallback next to the pinned digest; record the resolved digest at install so drift is visible.
- **[External `tunnel_tunnel-net` assumed by copied compose]** → the portable compose must define its own network; a leftover `external: true` reference would break a fresh host. Covered by a "fresh machine, no tunnel" verification.
- **[Provider switch corrupts vectors due to dimension change (1024 vs bge-m3)]** → treat provider as install-time; document the reindex (Cognee: clear derived graph/vector + re-`cognify` `main_dataset`; OpenViking: `vectors_only` reindex) and do not offer silent hot-switch.
- **[OpenViking client-key provisioning differs from lab admin URL]** → portable script targets the local admin endpoint; if provisioning fails, surface it as an install failure with the redacted HTTP code, never a fake key.
- **[Divergence between the shipped stack and the lab `/mnt/vol_328/MCP` tree]** → the shipped stack is the source of truth for the product; the lab tree keeps its extra tunnel/LAN features as an overlay, not a fork of the defaults.
- **[Secret leakage during audit/backfill]** → keep the redaction rule; ship only empty `.example` secrets; verify no key strings in committed files.

## Migration Plan

1. Land the portable assets under the profile and the new `/install-memory-mcp` command; keep `mcp.optional/*.json` opt-in.
2. Point `/install-cognee`, `/install-openviking`, `/installtools`, `/checkmcp` at the shipped ports/stack; mark upstream Cognee as superseded.
3. Fix skills/rules; add/adjust contract tests (fragment/tool alignment, "no lab paths in shipped compose", "only `.example` secrets committed").
4. Existing lab host: no data move; continue via `~/mcp-ctl.sh`. New host: run `/install-memory-mcp`. Rollback = remove the `memory`/`knowledge` entries from `mcp.json` and stop the stack; data on disk is preserved.

## Open Questions

- Exact Ollama default model IDs and the Cognee LiteLLM route for Ollama embeddings (and their dimension) to re-validate before pinning — deferred to tasks; does not change the specs or the chosen overlay approach.
- Final directory name for the shipped stack under `mcp.optional/` — cosmetic, resolved in tasks.
