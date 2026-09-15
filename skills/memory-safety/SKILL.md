---
name: memory-safety
description: "Gate every candidate shared-memory write: reject secrets, temporary output, unconfirmed hypotheses, low-value noise, duplicates, and wrongly scoped information."
---

# Memory Safety

Apply before every shared-memory write. The **single source of redaction** is `packages/pi-1c-agent/lib/redact.mjs` (`redact(text)` → `{ text, kinds }`, plus `hasUnredactableSecret`). Do not maintain a second secret list in prose.

## Reject

Never persist live secrets. The shared routine replaces tokens, passwords, cookies, API keys, private keys, authorization headers, credentialed DSNs, and secret-store values with `[REDACTED:<kind>]`. If `hasUnredactableSecret` is still true after redaction, **do not write**.

Also never persist:

- temporary stdout/stderr;
- full command histories;
- large source-code dumps;
- raw transcripts (except the opt-in OpenViking **document** path);
- unconfirmed hypotheses presented as facts;
- trivial one-off actions;
- duplicate information already stored under the same `idempotency_key`.

If a candidate contains a secret mixed with useful context, keep only the redacted durable fact.

## Scope check

Before write ask:

1. Is this truly durable?
2. Is it confirmed?
3. Will a later agent benefit from it?
4. Is the scope `project:<canonical-id>` or `global`?
5. Is there a more authoritative source that should remain the primary reference?
6. Does a matching `idempotency_key` already exist?

Only write when the answers justify persistence.
