## 1. Portable stack assets (profile-owned)

- [x] 1.1 Create the shipped stack dir (e.g. `mcp.optional/memory-stack/`) with a portable `compose.yml` for `openviking` + `cognee`: pinned images (digest + documented tag fallback), a stack-local network (no `tunnel_tunnel-net`), loopback-only host binds (`127.0.0.1:1933`, `127.0.0.1:8001`), configurable data root (default `./data`), and no `172.19.0.*` publishing.
- [x] 1.2 Add `compose.routerai.yml` overlay reproducing the current Cognee Router AI config verbatim (LLM `hosted_vllm/${ROUTERAI_MODEL}`, `reasoning_effort=none`, embeddings `qwen/qwen3-embedding-8b` dim 1024, sqlite/lancedb/ladybug, auth off, `COGNEE_MCP_AGENT_SCOPED=false`, `COGNEE_SKIP_CONNECTION_TEST=true`).
- [x] 1.3 Add `config/openviking/ov.conf.template` + `render-openviking-config.sh` (portable copy) with loopback CORS/host and Router AI as default profile; drop lab IPs.
- [x] 1.4 Add `secrets/*.env.example` templates (routerai, openviking-root, openviking-client) with empty values; ensure `.gitignore` covers the real `secrets/*.env` and rendered `ov.conf`.

## 2. Ollama alternative (paired)

- [x] 2.1 Re-validate Ollama default model IDs (VLM/LLM + embedding) and the LiteLLM route + embedding dimension for both servers; record the chosen defaults.
- [x] 2.2 Add `compose.ollama.yml` Cognee overlay (Ollama LLM + Ollama embedding model + matching dimensions) so Cognee — not only OpenViking — has an Ollama config.
- [x] 2.3 Wire the OpenViking `local`/Ollama render branch to the shipped endpoint and add an optional Ollama container overlay so `--provider ollama` brings up LLM + both servers with no external key.

## 3. Single install / bring-up command

- [x] 3.1 Add a minimal portable bring-up script (render config → `docker compose up -d` → wait both `/health` on loopback → provision OpenViking client key against the local admin URL); omit AWG tunnel reconnect and LAN publishing.
- [x] 3.2 Add `prompts/install-memory-mcp.md` (+ `/1c-install-memory-mcp` alias) as the single command: Router AI default (asks only for the API key), explicit Ollama selection, status and disable subcommands; honor the Docker product policy (probe once, host fallback, no loop).
- [x] 3.3 Add health/status + disable behavior (stop or remove `memory`/`knowledge` `mcp.json` entries) that preserves data and leaves other servers untouched.

## 4. Route installers to our stack; supersede upstream Cognee

- [x] 4.1 Rewrite `prompts/install-cognee.md` and `prompts/install-openviking.md` to describe/delegate to the paired portable stack (correct ports 1933/8001, images, dataset `main_dataset`, Router AI default); remove the contradictory `cognee/cognee-mcp:main` port-8010 single-container instructions.
- [x] 4.2 Update `prompts/installtools.md` so the Cognee/OpenViking rows install *our* stack and the agent never installs the upstream `comol/ai_rules_1c` Cognee; keep them opt-in (not preselected by `recommended`).
- [x] 4.3 Update `prompts/checkmcp.md` memory probes to the shipped ports/health endpoints (1933/8001) and mirror the `/1c-*` alias prompts.

## 5. Client fragments & docs alignment

- [x] 5.1 Align `mcp.optional/memory.json` + `mcp.optional/knowledge.json` include/exclude tool lists and URLs with what the shipped servers actually expose.
- [x] 5.2 Update `mcp.optional/README.md` and `mcp.example.json` to reference the shipped stack (ports, tools, one-command install) while keeping default `mcp.json` empty of `memory`/`knowledge`.

## 6. Skills & rules audit

- [x] 6.1 Reconcile the global memory rule (in `AGENTS.md`) and skills `shared-memory`, `knowledge-retrieval`, `context-bootstrap`, `context-router`, `memory-safety`, `memory-maintenance`, `session-handoff` with real server/port/dataset/tool-name facts; fix any contradiction (write-tool names, `main_dataset`, opt-in wording).
- [x] 6.2 Verify each corrected skill/rule against the actually exposed tools of the running stack.

## 7. Verification

- [x] 7.1 Add/adjust contract tests: shipped compose has no `/mnt/vol_328` paths, no `tunnel_tunnel-net`, no `172.19.0.*`; only `.example` secrets committed; fragment tool lists match server tools; default `mcp.json` still has no memory servers.
- [ ] 7.2 Fresh-machine smoke: run the install command with a Router AI key on a host without the lab tree and confirm both servers reach healthy; then repeat selecting Ollama.
- [x] 7.3 Disable/re-enable check: disabling one provider preserves data and leaves the other + 1C bundle intact.
- [x] 7.4 Run `openspec validate portable-memory-mcp-install --strict` and fix any issues.
