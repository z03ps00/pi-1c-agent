# Agent memory queue

- `pending/` — redacted records that were not verified on write (`UNCONFIRMED`).
- `done/` — same records after `/memory-flush` or session-start reconciliation confirmed them. History is kept; nothing is deleted.

Shape (YAML front matter + body):

```text
---
idempotency_key: task=…; agent=…; date=YYYY-MM-DD; content_hash=…
status: UNCONFIRMED | confirmed
target: memory | knowledge
correlation_id: …
---
redacted content
```
