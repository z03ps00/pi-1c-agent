## 1. Shared libraries (pi-1c-agent package)

- [x] 1.1 Add `lib/redact.mjs`: single redaction routine returning `{ text, kinds[] }`, replacing tokens/passwords/cookies/API keys/private keys/auth headers/credentialed DSNs/secret-store values with `[REDACTED:<kind>]`; expose a `hasUnredactableSecret(text)` guard
- [x] 1.2 Add `lib/memory-key.mjs`: `normalizeRecord`, `contentHash(redactedText)` (sha256 hex over redacted bytes), `buildIdempotencyKey({task,agent,date,contentHash})`, and `mintCorrelationId()`
- [x] 1.3 Add `lib/project-id.mjs`: derive canonical `project-id` from git remote → `.pi/1c/project-id` → normalized repo basename; strip trailing/edge whitespace so the trailing-space workspace path resolves identically
- [x] 1.4 Unit tests: redaction of each secret kind + unredactable-blocks-write; hash is stable and reflects redacted (not raw) content; idempotency key stability; project-id normalization incl. the trailing-space case

## 2. Anonymous mutator coverage (pi-1c-agent package)

- [x] 2.1 Extract Cognee/OpenViking mutator tool names into one maintained list consumed by both `extensions/1c-mode/index.ts` and `lib/plan-policy.mjs`
- [x] 2.2 Contract test: every listed mutator is denied at anon level ≥ 1; a listed-but-uncovered mutator fails the test

## 3. Write contract in skills (profile repo)

- [x] 3.1 Update `skills/shared-memory` and `skills/knowledge-retrieval`: redact → compute key → dedup-by-key → write → verify-by-recall → report recorded/`UNCONFIRMED`; add `correlation_id` to paired writes
- [x] 3.2 Update `skills/memory-safety` to point at the shared redaction routine as the single source (no divergent secret list)
- [x] 3.3 Update `skills/context-router`/`skills/memory-maintenance` for the unified `Memory:` status line (recalled … / saved … / `UNCONFIRMED` / `skipped — anonymous`)
- [x] 3.4 Align `AGENTS.md` and `packages/pi-1c-agent/bootstrap/AGENTS.managed.md` global memory rule wording with the shared contract (redaction, hash-after-redaction, verify-after-write, correlation id, canonical project-id)

## 4. Pending-queue reconciliation (pi-1c-agent package + profile)

- [x] 4.1 Define the pending record shape (idempotency_key, target server, status, redacted content) and add `state/agent-memory/done/` as the confirmed location (history preserved, no deletion)
- [x] 4.2 Implement one reconcile routine: for each pending record, dedup-by-key → write when absent → verify → mark confirmed / move to `done/`; leave untouched and report once when the server is offline (no retry loop)
- [x] 4.3 Wire startup reconciliation on `session_start` when Cognee/OpenViking are opted in and reachable; add the reconcile step to `skills/context-bootstrap`
- [x] 4.4 Add `registerCommand("memory-flush")` + `prompts/memory-flush.md` + `prompts/CATALOG.md` row: on-demand reconcile with counts (confirmed / still-pending / duplicate-skipped); no writes when offline or anonymous
- [x] 4.5 Verify the reconcile path drains the existing `state/agent-memory/pending/20260915-approve-mode.md` once a server is reachable

## 5. Session capture (pi-1c-agent package + profile)

- [x] 5.1 Implement the distiller: extract durable items (objective, decisions+rationale, files/objects changed, verification, unresolved, next steps) reusing the `lib/handoff.mjs` field set; redact via `lib/redact.mjs`
- [x] 5.1a Run automatic distillation **out-of-band**: a child session/subagent reads the persisted transcript file (never `sendUserMessage` into the main window); fire async on `agent_settled`, never awaited by the main turn; catch failures and downgrade to a pending record
- [x] 5.2 Route capture output through the write contract: short fact → Cognee, detailed handoff → OpenViking, shared `correlation_id`; substantial-only gate (nothing durable → no write)
- [x] 5.3 Add `registerCommand("wrap")` + `prompts/wrap.md` + `prompts/CATALOG.md` row as the manual reserve "close/save dialog now"; works on both hosts (no lifecycle event dependency)
- [x] 5.4 Add the Pi idle trigger on `agent_settled` **enabled by default**, with a persisted disable/enable toggle (mirror `session-rotate` state); write incrementally under one per-session `correlation_id`, deduping by `idempotency_key` so repeated idles supersede rather than duplicate
- [x] 5.5 Add opt-in raw-transcript archival: redact the session `.jsonl` and store as an OpenViking **document** marked "raw transcript", never as a Cognee fact; no archival without opt-in
- [x] 5.6 Enforce mode/anon gates: no writes in ASK/PLAN or anonymous; anonymous reports `Memory: skipped — anonymous` with no pending record
- [x] 5.7 Update `skills/session-handoff` to note capture reuses the handoff format and the distill-not-dump rule
- [x] 5.8 Implement the heuristic (no-model) distiller: extract files changed, tools invoked, and explicit decisions from structured session entries via regex/parse — no provider call
- [x] 5.9 Add `registerCommand("capture-model")` + `prompts/capture-model.md` + `prompts/CATALOG.md` row: `status | off | stack | ollama <model> | routerai <model> | chat`; persist like `session-rotate` state; show current mode/provider/model in footer/status; default `stack`
- [x] 5.10 Wire the distiller to the selected provider: `stack`/`routerai`/`ollama` call the memory-stack or named endpoint (key from `secrets/*.env`, never memory); `chat` runs the main chat model in a child session; on provider-unreachable fall back to heuristic and mark the record, else queue pending

## 6. Documentation (profile repo)

- [x] 6.1 README note: in Pi the idle capture is ON by default (memory accrues in the background); `/wrap` is the manual reserve; capture distills and never stores raw transcripts in memory; idle capture is Pi-only (dual-host gap)
- [x] 6.2 Document the disable/enable toggle and that anon/ASK/PLAN gates still block all writes even with automatic capture on

## 7. Tests and verification (pi-1c-agent package)

- [x] 7.1 Reconciliation tests: drains when reachable; dedup-skips existing key; leaves queue intact and reports once when offline; skips in anonymous
- [x] 7.2 Capture tests: `/wrap` writes paired records with one `correlation_id`; distill-not-dump (no raw transcript in memory); trivial session writes nothing; anon/read-only mode writes nothing
- [x] 7.3 Verify-after-write tests: confirmed on read-back; `UNCONFIRMED` + pending when read-back fails/offline
- [x] 7.4 Idle-capture tests: on by default in Pi; fires automatically at idle; disable/enable toggle honored and persisted; repeated idle supersedes under one correlation_id (no duplicates); inactive under Cursor
- [x] 7.4a Out-of-band tests: idle capture does not call `sendUserMessage` into the main session and does not grow main-window context; a new user turn is not blocked by an in-flight capture; a capture failure leaves the main session intact and writes a pending record
- [x] 7.4b Distiller-config tests: `/capture-model` set/status for each mode (off/stack/ollama/routerai/chat), persisted across sessions; heuristic mode makes no provider call; provider-unreachable falls back to heuristic and marks the record; keys are never written to memory
- [x] 7.5 Run profile tests (`node tests/run-all.mjs`) and package `doctor --package-only`; record pass/fail

## Verification (2026-09-16)

- `node packages/pi-1c-agent/tests/run-all.mjs` — 122 pass, 0 fail
- `node packages/pi-1c-agent/tools/doctor.mjs --package-only` — CORE: PASS
- `node tests/run-all.mjs` (profile) — 86 pass, 0 fail, 1 skipped (live scenarios off)
