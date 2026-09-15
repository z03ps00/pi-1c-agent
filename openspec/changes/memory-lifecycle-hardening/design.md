## Context

See `proposal.md` — Why. Today the memory layer is enforced almost entirely by prompt rules; only the anonymous gate and session rotation are backed by code (`packages/pi-1c-agent/extensions/1c-mode`, `1c-session-rotate`, `lib/plan-policy.mjs`, `lib/handoff.mjs`). Confirmed constraints from the current codebase:

- Available Pi lifecycle events in use: `session_start`, `before_agent_start`, `tool_call`, `agent_end`, `agent_settled`, `session_before_compact`. There is **no** `session_end`/on-exit event, so "dialog closed" cannot be hooked directly.
- Cursor persists raw transcripts as `agent-transcripts/<uuid>/<uuid>.jsonl`; Pi keeps its own session files. Raw data is on disk already — the gap is distillation and confirmed persistence, not storage.
- The anonymous mutator list is a regex duplicated in `extensions/1c-mode/index.ts` and `lib/plan-policy.mjs`.
- Redaction and the `idempotency_key`/`content_hash` rules are described in `AGENTS.md`, the `memory-safety` skill, and install prompts, but no shared code implements them.
- One `UNCONFIRMED` pending record already exists (`state/agent-memory/pending/20260915-approve-mode.md`) with nothing to drain it.
- The working directory path carries a trailing space (`.../1c-pi-profile `) and is bind-mounted, which is a real scope-derivation hazard.

## Goals / Non-Goals

**Goals:**
- One shared, testable implementation of redaction, `content_hash`, `idempotency_key`, and `correlation_id` reused by every write path (direct write, pending queue, session capture).
- A closed pending-queue loop: queue on unconfirmed, reconcile and confirm when servers return.
- Capture of completed/idle dialogs into distilled durable memory, never raw transcripts. In Pi (the target host) this runs automatically at idle by default; `/wrap` is the manual reserve. Automatic capture is user-toggleable.
- Writes always respect anon and read-only (ASK/PLAN) gates, even with automatic capture on; reconciliation and pending-queue behavior are unchanged by the capture default.

**Non-Goals:**
- Replacing Cognee/OpenViking with a different provider, or changing the memory-stack images/ports.
- Editing or deleting existing memory records via provider mutators — corrections stay supersede-only.
- Building a general audio/video pipeline — the existing `transcribe` skill stays for media; this change is about chat sessions.
- Full-text transcript search as a default — raw-transcript archival is opt-in and lands in OpenViking as a document.

## Decisions

**D1 — Shared libs over repeated prose.** Add `lib/redact.mjs` (single redaction routine returning redacted text + detected kinds) and `lib/memory-key.mjs` (normalize record → compute `content_hash` on the redacted bytes → build `idempotency_key` → mint `correlation_id`). Skills and extensions call these. *Alternative:* keep prose-only and trust the model — rejected because it is the current source of drift and the existing unconfirmed pending record.

**D2 — Reconciliation on `session_start` plus `/memory-flush`.** Startup reconciliation drains the queue automatically when servers are reachable; `/memory-flush` gives an on-demand path and a status report. Both share one reconcile routine. Confirmation moves records to `state/agent-memory/done/` (history preserved) rather than deleting. *Alternative:* a background watcher — rejected; no persistent daemon in this profile and it would fight the idle model.

**D3 — Verify-after-write via read-back.** After a write, recall by `idempotency_key`; only a positive read-back reports "recorded". This directly removes the "queued, not confirmed" failure mode. When the provider cannot confirm, the record is written to the pending queue and reported `UNCONFIRMED`.

**D4 — Capture = distill, not dump.** Capture reuses the handoff shape from `lib/handoff.mjs`/`session-handoff` to extract durable items, then routes short fact → Cognee, detailed handoff → OpenViking, linked by `correlation_id`. Raw `.jsonl` is archived only on explicit opt-in and only as an OpenViking **document**, never as a Cognee fact — this honors `memory-safety`'s "no raw transcripts in memory".

**D4a — Out-of-band, non-blocking distillation.** Automatic idle capture must not run inside the main conversation. The distiller runs in a separate child session/subagent that reads the persisted transcript file (`agent-transcripts/<uuid>/<uuid>.jsonl` under Cursor; the Pi session file under Pi) — or via non-model extraction — and calls the memory MCP directly. Nothing is injected into the main window via `sendUserMessage`, so the main context is not grown or polluted (this is the deliberate divergence from `session-rotate`, which is in-band because it is starting a fresh session anyway). Capture is fired asynchronously on `agent_settled`, never awaited by the main turn, and a failure is caught and downgraded to a pending record. *Alternative:* in-band `followUp` distillation — rejected precisely because it would consume main-window context on every idle.

**D4b — Distiller model/provider is a separate, user-selectable setting.** Distillation runs on its own configured model, chosen independently of the main chat via `/capture-model` and persisted like `session-rotate` state. Modes: `off` (heuristic-only, no model — regex/structured extraction of files changed, tools invoked, decisions), `stack` (reuse the memory-stack provider/model — Router AI `qwen/qwen3.5-9b` or Ollama `qwen3.5:9b`, whichever is up), `ollama <model>`, `routerai <model>`, and `chat` (same model/provider as the main chat, in a child session). Default: `stack` — it is already provisioned, independent of main-chat credits, and cheap (free on Ollama). Provider keys come only from local secret files (`secrets/*.env`), never memory. If the chosen provider is unreachable at capture time, fall back to heuristic extraction (marked as a fallback) so memory still accrues; if even that fails, queue a pending record. *Alternative:* hard-wire one model — rejected because the user explicitly wants per-need choice (local vs Router AI vs chat-grade vs free heuristics).

**D5 — Automatic idle capture on by default in Pi, `/wrap` as reserve.** The target host is Pi, so the idle trigger hooks `agent_settled` (the same event `1c-session-rotate` uses) and is **enabled by default**; memory accrues in the background without user action. The explicit `/wrap` command is the manual reserve for "close/save this dialog now" and works regardless of host. Because there is no `session_end` event, "on close" is approximated by idle; the honest contract is "capture at idle (auto) or on demand (`/wrap`)". Automatic capture writes incrementally: one per-session `correlation_id`, dedupe by `idempotency_key`, supersede rather than duplicate, so repeated idles in one session update the same record set. Under Cursor the auto trigger cannot fire (no hooks) — documented as a dual-host gap; but Cursor is not a target host here. The setting is user-toggleable (disable/enable) and persisted like the `session-rotate` state.

**D6 — Anonymous mutator list as data + contract test.** Extract the mutator tool names into a single maintained list consumed by both anon-check sites, and add a contract test asserting every listed mutator is denied at anon level ≥ 1. *Alternative:* keep two hand-maintained regexes — rejected; drift risk is the whole point.

**D7 — Canonical `project-id`.** Derive from git remote when present, else a `.pi/1c/project-id` marker, else a normalized repo basename with trailing/edge whitespace stripped. One helper used everywhere a project scope is written.

**D8 — Package-side vs profile-side split.** Mirror the `productize-pi-1c-agent` / `session-rotation-handoff` precedent: profile repo holds skills, prompts, catalog, rule text, and state layout; the `pi-1c-agent` package (outside this git tree) holds the libs, extension wiring, and tests. Tasks label each item accordingly.

## Risks / Trade-offs

- **No `session_end` event** → capture can miss a dialog that is closed without going idle. Mitigation: `/wrap` is the guaranteed path; idle capture is best-effort and documented as such.
- **Provider `remember` is async/eventually-consistent** → read-back may transiently fail even on success. Mitigation: bounded verify retry, then `UNCONFIRMED` + pending; reconciliation dedupes by key so no double-store on the next pass.
- **Distillation quality** → a poor summary stores weak memory. Mitigation: reuse the proven handoff field set and require the durable-items gate; trivial sessions store nothing.
- **Redaction gaps** → a novel secret shape slips through. Mitigation: centralize in `redact.mjs` with unit tests and a conservative "block write if unredactable" rule; secrets never leave `.dev.env`/secret files.
- **Cross-host divergence** → idle capture behaves differently in Cursor. Mitigation: off by default, `/wrap` identical on both, README dual-host note.
- **Scope-id drift from the trailing-space path** → split memory. Mitigation: normalization helper with a dedicated test case for the trailing space.

## Migration Plan

1. Land libs (`redact.mjs`, `memory-key.mjs`) and the anon mutator list + contract test — no behavior change yet.
2. Add reconciliation and `/memory-flush`; on first run it drains the existing `20260915-approve-mode.md` pending record (verify it lands, then move to `done/`).
3. Add `/wrap` capture (manual reserve, both hosts), then the Pi idle trigger enabled by default with a disable/enable toggle and incremental (correlation-id-scoped) writes.
4. Update skills, prompts/catalog, `AGENTS.md`/`AGENTS.managed.md` memory-rule wording, and `README.md` dual-host note.
5. Rollback: remove the two commands and the idle hook; the pending queue and skills revert to today's prompt-only behavior. Stored records and the `done/` folder are unaffected.

## Open Questions

- Exact `content_hash` algorithm/encoding surface (sha256 hex is assumed) — deferrable; does not change specs or task breakdown.
- Whether `done/` records should later be pruned by age — out of scope here; can be a follow-up maintenance change.
