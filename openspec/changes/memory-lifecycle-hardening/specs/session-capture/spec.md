## Purpose

Lets a completed or idle dialog be captured into durable memory by distilling it into confirmed facts and a handoff report, so useful context is not lost while raw transcripts are never dumped into shared memory.

## ADDED Requirements

### Requirement: Explicit capture command

The system SHALL expose a command that captures the current session into durable memory on demand. The command MUST distill the session into durable items (objective, decisions and rationale, files/objects changed, verification, unresolved work, next steps) and route them per the write contract: a short fact to Cognee and a detailed handoff to OpenViking, linked by a shared `correlation_id`. It MUST work on both hosts because it is user-invoked.

#### Scenario: Capture on demand

- **WHEN** the user invokes the capture command in a substantial session with a memory server reachable
- **THEN** a short fact is written to Cognee and a detailed handoff to OpenViking, sharing one `correlation_id`

#### Scenario: Capture works under Cursor

- **WHEN** the capture command is invoked under the Cursor host
- **THEN** it distills and writes the same way, without depending on a session-end event

### Requirement: Distillation instead of raw transcript

Capture SHALL store only distilled durable knowledge and MUST NOT write a raw transcript or raw tool output into Cognee or into OpenViking's memory/decision layer. Secrets MUST be redacted via the shared redaction routine before any write.

#### Scenario: Raw transcript is not stored as memory

- **WHEN** a session is captured
- **THEN** the stored records contain distilled decisions, changes, and next steps, not the verbatim transcript or raw tool output

#### Scenario: Secrets never reach capture output

- **WHEN** the captured session contained secrets
- **THEN** the written records contain `[REDACTED:<kind>]` markers and no live secret values

### Requirement: Optional raw transcript archival as a document

The system MAY archive the raw session transcript as an OpenViking document, separate from the decision/fact layer, only when the user opts in. Such an archived transcript MUST be redacted and MUST be clearly marked as a raw transcript document, never as a Cognee decision/fact.

#### Scenario: Opt-in transcript archival

- **WHEN** the user opts in to archive the raw transcript
- **THEN** the redacted transcript is stored as an OpenViking document marked as a raw transcript, distinct from Cognee facts

#### Scenario: No archival without opt-in

- **WHEN** the user does not opt in to transcript archival
- **THEN** only the distilled records are written and no raw transcript is stored

### Requirement: Automatic idle capture on by default in Pi

The system SHALL, in the Pi host, automatically capture the session when the agent becomes idle (`agent_settled`) after substantial work, and this automatic trigger MUST be enabled by default. The user MUST be able to disable or re-enable it. Under Cursor the automatic trigger does not activate (no lifecycle hooks) and capture is performed only by the explicit command; this dual-host gap MUST be documented. An idle capture MUST NOT duplicate a capture already produced for the same session state — it writes incrementally under one per-session `correlation_id`, deduping by `idempotency_key` and superseding rather than copying.

#### Scenario: Idle capture fires automatically in Pi by default

- **WHEN** a session runs in Pi, the user has not changed the setting, and the agent becomes idle after substantial work
- **THEN** the session is captured automatically without the user invoking any command

#### Scenario: Repeated idle does not duplicate

- **WHEN** the agent goes idle again later in the same session with new durable items
- **THEN** the capture updates the existing per-session record set under the same `correlation_id` instead of creating duplicates

#### Scenario: User disables automatic capture

- **WHEN** the user disables automatic idle capture
- **THEN** no automatic capture happens for the rest of the session and only explicit `/wrap` captures it

#### Scenario: Idle capture inactive under Cursor

- **WHEN** the same profile runs under Cursor
- **THEN** automatic capture does not activate and the documentation explains it is Pi-only, with `/wrap` as the manual path

### Requirement: Automatic capture runs out-of-band and non-blocking

Automatic idle capture SHALL NOT consume or pollute the main conversation window and SHALL NOT block the agent. Distillation MUST run outside the main session context — in a separate child session/subagent that reads the persisted transcript, or by non-model extraction — so that no distillation instruction or tool output is injected into the main chat and the main window's context usage is unchanged. Capture MUST run asynchronously after idle and MUST NOT delay or interrupt the user's next turn. A capture failure MUST NOT break or roll back the main session; it falls back to a pending record.

#### Scenario: Main conversation window is not polluted

- **WHEN** automatic idle capture runs
- **THEN** no distillation prompt or tool output appears in the main conversation and its context usage is unchanged

#### Scenario: Capture does not block the next turn

- **WHEN** the user sends a new message while an automatic capture is still in progress
- **THEN** the new turn proceeds without waiting for capture to finish

#### Scenario: Capture failure is isolated

- **WHEN** an automatic capture fails
- **THEN** the main session continues unaffected and a redacted pending record is saved

### Requirement: Configurable distiller model and provider

The system SHALL let the user choose, independently of the main chat model, how distillation is performed for both automatic and `/wrap` capture, via a persisted setting and a command to set and inspect it. The supported modes MUST include: (a) **heuristic-only** — no model call, facts extracted from structured session entries (files changed, tools invoked, explicit decisions); (b) **stack** — the memory-stack provider/model (Router AI or Ollama, whichever the stack currently runs); (c) an explicit **Ollama** model; (d) an explicit **Router AI** model; (e) **chat** — the same model/provider as the main chat, executed in a child session. The setting MUST persist across sessions and survive rotation, and its current value MUST be reportable. Any provider credentials MUST be read from local secret files only and MUST NOT be written to memory.

#### Scenario: Select an Ollama model

- **WHEN** the user sets the distiller to a named Ollama model
- **THEN** subsequent captures distill via that local model and status reports it

#### Scenario: Select a Router AI model

- **WHEN** the user sets the distiller to a named Router AI model
- **THEN** subsequent captures use it with the key taken from local secrets, never from memory

#### Scenario: Heuristic-only mode

- **WHEN** the user selects the no-model mode
- **THEN** captures extract durable facts from structured session entries without any model call

#### Scenario: Same as main chat

- **WHEN** the user selects chat mode
- **THEN** distillation uses the main chat model/provider in a child session, still out-of-band from the main window

#### Scenario: Query distiller status

- **WHEN** the user requests the distiller setting
- **THEN** the current mode, provider, and model are reported without changing anything

### Requirement: Distiller fallback keeps capture working

When the configured distiller model or provider is unavailable at capture time, the system SHALL fall back to heuristic extraction so a rougher durable record is still produced, and MUST mark the record's distiller as a fallback. The capture MUST NOT be silently dropped. If even heuristic capture cannot run, the system MUST queue a pending record.

#### Scenario: Provider down falls back to heuristics

- **WHEN** the chosen distiller provider is unreachable at capture time
- **THEN** capture falls back to heuristic extraction, still writes a durable record, and marks it as a heuristic fallback

#### Scenario: Capture never silently lost

- **WHEN** neither the configured model nor heuristic extraction can complete
- **THEN** a redacted pending record is queued and reported `UNCONFIRMED`, not dropped

### Requirement: Capture respects mode and anonymity gates

Capture SHALL NOT write in a read-only mode (ASK/PLAN) or in an anonymous session, and MUST only run for substantial sessions. In an anonymous session it MUST report `Memory: skipped — anonymous` and make no write and no pending record.

#### Scenario: Anonymous capture is skipped

- **WHEN** capture is invoked in an anonymous session
- **THEN** no record and no pending record are written and the status reports skipped for anonymity

#### Scenario: Trivial session is not captured

- **WHEN** capture is invoked on a trivial session with no durable items
- **THEN** nothing is written and the command reports there was nothing durable to save
