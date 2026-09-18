# Multi-agent runtime operations

This profile runs extra Pi child processes. Treat memory queue, knowledge, and scheduler leases as **multi-process** resources.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PI_1C_MAX_SUBAGENTS` | `4` | **Profile-wide** cap on concurrent child Pi processes (all parent Pi processes sharing `$PI_CODING_AGENT_DIR`). **BREAKING** vs the older per-process reading. |
| `PI_1C_SUBAGENT_TIMEOUT_MS` | `600000` | Child timeout before SIGTERM; also the default scheduler lease heartbeat TTL |
| `PI_1C_CHILD_STDOUT_MAX_BYTES` | `1048576` | Retained child stdout cap (UTF-8 bytes) |
| `PI_1C_CHILD_STDERR_MAX_BYTES` | `262144` | Retained child stderr cap (UTF-8 bytes) |
| `PI_1C_CHILD_FRAME_MAX_BYTES` | `3145728` | Max JSON-lines frame; oversize frames fail with `child_frame_too_large` |
| `PI_1C_MEMORY_CLAIM_TTL_SEC` | `300` | Stale `processing/` claim reclaim |
| `PI_1C_CHILD_PROCESS` | unset | Set to `1` on spawned children |
| `PI_1C_DISABLE_STARTUP_RECONCILE` | unset | Set to `1` to skip startup memory reconcile |
| `PI_1C_MOCK_PI` | unset | Test-only path to a mock `pi` executable |

Child processes are started with `PI_1C_CHILD_PROCESS=1` and `PI_1C_DISABLE_STARTUP_RECONCILE=1` so only the parent does housekeeping.

## Lease layout

`$PI_CODING_AGENT_DIR/state/runtime/`

- `subagents/slots/<n>/owner.json` — exclusive child slots (`mkdir` claim, owner token, heartbeat)
- `resources/<kind>-<hash>.lock/holders.json` — shared/exclusive resource leases (`project-tree`, `git-index`, `build-dir`, `ib`, `knowledge`, `mcp`)
- `diagnostics/YYYY-MM-DD.jsonl` — durable structured events (`runId`, parent, agent, stage)

Release a lease only with the matching owner token. Stale heartbeats are reclaimed after `PI_1C_SUBAGENT_TIMEOUT_MS`.

## ASK / handoff **BREAKING**

- ASK rejects writer/execution subagents (`1c-developer` and other writers) before spawn. Use `/mode build`.
- Child ASK prompts never say BUILD. ASK child allowlists exclude `write`/`edit`/`bash`.
- Handoff JSON must have `schema: 2`, `runId`, `agent`, `status`, and structured `verification` objects. Unlabeled v1 envelopes are rejected.

## Cold memory-queue migration

1. Stop active multi-agent sessions.
2. Backup `state/agent-memory/`.
3. Update the package.
4. Run `/doctor` (or `node packages/pi-1c-agent/tools/doctor.mjs --global`).
5. Confirm `pending/`, `processing/`, `done/`, and `failed/` exist. Doctor reports duplicate ids if a crash left two copies; it prefers `done|failed` over `processing`.
6. Run one foreground `/memory-flush`.
7. Inspect `pending/`, `processing/`, `failed/`.
8. Only then resume parallel subagent work.

Migration and remote reconcile stay separate so a rollback is a directory restore.

ACK is rename-based: rewrite the claimed file, then `rename` it into `done|failed|pending`. Directory membership is the record status.

## Rollback triggers

Treat a release as unsafe if any of these happen:

- a pending record disappears (`pending + processing + done + failed` shrinks) or the same id appears in two directories
- more than one owner holds `project-tree: exclusive` for one project
- child count across parents exceeds `PI_1C_MAX_SUBAGENTS`
- ASK successfully spawns `1c-developer`
- a missing or malformed mode resolves to BUILD
- a timed-out child is left running
- a handoff without `schema: 2` is accepted
- redaction tests find a known secret in a remote payload
- `doctor` does not print `CORE: PASS`

## Compatibility

- Node `>=22.19.0` (profile and package). Installer and doctor fail early below that.
- Pi host peers are pinned to the tested 0.85.x window, not `*`.
