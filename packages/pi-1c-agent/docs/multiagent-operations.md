# Multi-agent runtime operations

This profile runs extra Pi child processes. Treat memory queue and mode state as **multi-process** resources.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PI_1C_MAX_SUBAGENTS` | `4` | Process-wide cap on concurrent child Pi processes |
| `PI_1C_SUBAGENT_TIMEOUT_MS` | `600000` | Child timeout before SIGTERM |
| `PI_1C_CHILD_STDOUT_MAX_BYTES` | `1048576` | Retained child stdout cap |
| `PI_1C_CHILD_STDERR_MAX_BYTES` | `262144` | Retained child stderr cap |
| `PI_1C_MEMORY_CLAIM_TTL_SEC` | `300` | Stale `processing/` claim reclaim |
| `PI_1C_CHILD_PROCESS` | unset | Set to `1` on spawned children |
| `PI_1C_DISABLE_STARTUP_RECONCILE` | unset | Set to `1` to skip startup memory reconcile |
| `PI_1C_MOCK_PI` | unset | Test-only path to a mock `pi` executable |

Child processes are started with `PI_1C_CHILD_PROCESS=1` and `PI_1C_DISABLE_STARTUP_RECONCILE=1` so only the parent does housekeeping.

## Cold memory-queue migration

1. Stop active multi-agent sessions.
2. Backup `state/agent-memory/`.
3. Update the package.
4. Run `/doctor` (or `node packages/pi-1c-agent/tools/doctor.mjs --global`).
5. Confirm `pending/`, `processing/`, `done/`, and `failed/` exist. Legacy `pending/*.md` files are claimed in place — do not reconcile remotely yet if you need a rollback copy.
6. Run one foreground `/memory-flush`.
7. Inspect `pending/`, `processing/`, `failed/`.
8. Only then resume parallel subagent work.

Migration and remote reconcile stay separate so a rollback is a directory restore.

## Rollback triggers

Treat a release as unsafe if any of these happen:

- a pending record disappears (`pending + processing + done + failed` shrinks)
- more than one writer holds an exclusive filesystem resource
- child count exceeds `PI_1C_MAX_SUBAGENTS`
- a missing or malformed mode resolves to BUILD
- a timed-out child is left running
- redaction tests find a known secret in a remote payload
- `doctor` does not print `CORE: PASS`

## Compatibility

- Node `>=22.19.0` (profile and package). Installer and doctor fail early below that.
- Pi host peers are pinned to the tested 0.85.x window, not `*`.
