# Agent memory queue

- `pending/` — redacted records waiting for the background worker (`queued`) or left after a failed MCP write (`UNCONFIRMED`).
- `processing/` — claimed by a live worker.
- `done/` — confirmed after the worker called MCP and verified by recall. History is kept; nothing is deleted.
- `failed/` — still unconfirmed after five worker attempts.
- `worker.lock` / `worker.log` — single-instance flush process that survives session close.

`queued` means the file is in the queue and MCP has not confirmed it yet. Agents must not call `remember` in the turn; they write a pending file and start `packages/pi-1c-agent/lib/memory-flush-worker.mjs` without waiting.

Shape (YAML front matter + body):

```text
---
idempotency_key: task=…; agent=…; date=YYYY-MM-DD; content_hash=…
status: queued | UNCONFIRMED | confirmed | failed
target: memory | knowledge
correlation_id: …
---
redacted content
```
