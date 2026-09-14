---
name: memory-safety
description: "Gate every candidate shared-memory write: reject secrets, temporary output, unconfirmed hypotheses, low-value noise, duplicates, and wrongly scoped information."
---

# Memory Safety

Apply before every shared-memory write.

## Reject

Never persist:
- passwords;
- API keys/tokens;
- private keys;
- session cookies;
- credentials;
- authentication headers;
- raw secrets from `.env` or secret stores;
- temporary stdout/stderr;
- full command histories;
- large source-code dumps;
- raw transcripts;
- unconfirmed hypotheses presented as facts;
- trivial one-off actions;
- duplicate information already stored with the same meaning.

If a candidate contains a secret mixed with useful context, redact the secret and keep only the non-sensitive durable fact if it remains useful.

## Scope check

Before write ask:
1. Is this truly durable?
2. Is it confirmed?
3. Will a later agent benefit from it?
4. Is the scope global or project-specific?
5. Is there a more authoritative source that should remain the primary reference instead?
6. Does a matching record already exist?

Only write when the answers justify persistence.
