## Purpose

Defines the runtime working modes of the Pi 1C agent (ASK, PLAN, BUILD) and the anonymous-session levels (ANON 0–3), so the agent starts read-only by default, can answer questions without mutating anything, can plan without touching project code, and can work anonymously without leaving traces in shared agent memory — all enforced by the Pi `1c-mode` extension without conflicting with existing rules.

## ADDED Requirements

### Requirement: Three primary working modes

The agent SHALL expose exactly three primary modes — ASK, PLAN, BUILD — as a persisted per-session state machine. Each mode SHALL have a defined phase set: ASK → `ask-idle`; PLAN → `plan-draft` | `plan-ready`; BUILD → `build-idle` | `build-executing`. Mode and phase SHALL be persisted in the Pi session record and restored on resume.

#### Scenario: Modes are enumerable and persisted

- **WHEN** a session is active in any mode
- **THEN** the current mode is one of ASK, PLAN, BUILD with a valid phase, and the pair survives a resume of the same session

#### Scenario: A resumed session keeps its mode

- **WHEN** a session that was switched to PLAN is resumed later
- **THEN** the agent restores PLAN, not the startup default

### Requirement: Default startup mode is ASK and is overridable

A NEW session SHALL start in ASK (read-only) by default. The default SHALL be overridable, in precedence order, by the `--1c-mode <plan|build|ask>` launch flag and the `PI_1C_DEFAULT_MODE` environment variable. A restored session SHALL keep its own persisted mode rather than re-applying the startup default.

#### Scenario: Fresh session is read-only by default

- **WHEN** a brand-new session starts with no flag and no env override
- **THEN** the agent is in ASK and no file-mutating or infrastructure-mutating tool can run until the user switches mode

#### Scenario: Default can be pinned to BUILD

- **WHEN** `PI_1C_DEFAULT_MODE=build` (or `--1c-mode build`) is set for a new session
- **THEN** the session starts in BUILD

### Requirement: Mode switching surfaces

The agent SHALL provide `/mode plan|build|ask`, the aliases `/1c-plan`, `/1c-build`, `/1c-ask`, `/1c-execute-plan`, and the `Ctrl+Alt+P` hotkey that cycles BUILD → PLAN → ASK → BUILD. A mode change requested while a run is in flight SHALL take effect only on the next run, and the agent SHALL say so instead of contradicting the in-flight answer.

#### Scenario: Command switches mode

- **WHEN** the user runs `/mode ask`
- **THEN** the session enters ASK and the footer reflects it

#### Scenario: Hotkey cycles all three modes

- **WHEN** the user presses `Ctrl+Alt+P` three times starting from BUILD
- **THEN** the mode goes BUILD → PLAN → ASK → BUILD

#### Scenario: Mid-run switch defers to next turn

- **WHEN** a mode switch is issued while a turn is still running
- **THEN** the running turn keeps its original mode and the notification states the change takes effect on the next turn

### Requirement: Footer shows the mode and phase

The footer SHALL display `1C:ASK`, `1C:PLAN`, `1C:PLAN READY`, `1C:BUILD`, or `1C:BUILD <plan_id-suffix>` matching the current mode and phase, with a distinct colour for read-only modes versus BUILD.

#### Scenario: Plan-ready is visible

- **WHEN** a PLAN artifact becomes ready
- **THEN** the footer reads `1C:PLAN READY`

### Requirement: Authoritative per-turn mode note and one-shot change notice

On every run the system prompt SHALL carry one authoritative `# Current 1C mode` line stating the current mode and its meaning, declaring earlier in-conversation statements about the mode obsolete. On the first run after a mode change the agent SHALL emit exactly one in-band `[1C MODE CHANGE]` notice; the notice SHALL survive `/reload` and resume and SHALL NOT repeat.

#### Scenario: Model does not trust stale mode claims

- **WHEN** the transcript contains the model's earlier "we are in BUILD" but the mode is now ASK
- **THEN** the current-mode line for this turn states ASK and instructs the model to ignore the earlier claim

#### Scenario: Change is announced once

- **WHEN** the mode changes from ASK to PLAN
- **THEN** a single `[1C MODE CHANGE] ASK → PLAN` message is delivered on the next run and not repeated on subsequent runs

### Requirement: ASK is strictly read-only research

In ASK the agent SHALL answer questions using read-only tools and read-only MCP only. File writes SHALL be disabled completely: `write`/`edit` are not available and no path is writable, including the PLAN planning roots (`openspec/**`, `.pi/1c/**`). `bash` SHALL remain disabled in ASK (parity with 1C PLAN). ASK SHALL NOT emit a PLAN artifact or mark anything PLAN_READY.

#### Scenario: Write is blocked in ASK

- **WHEN** the agent attempts `write` or `edit` while in ASK
- **THEN** the tool call is blocked with a read-only reason and no file is created or changed

#### Scenario: Planning roots are not writable in ASK

- **WHEN** the agent tries to write under `openspec/**` or `.pi/1c/plans/**` in ASK
- **THEN** the write is blocked because planning writes belong to PLAN, not ASK

#### Scenario: Read-only research still works

- **WHEN** the agent uses a read-only search/read tool or a read-only MCP recall in ASK
- **THEN** the call is allowed

### Requirement: PLAN protects project code and allows only planning writes

In PLAN the agent SHALL keep project source, metadata, Git, dependencies, databases and external systems immutable. `bash` SHALL be disabled. Writes SHALL be allowed only under `openspec/**`, `.pi/1c/plans/**`, `.pi/1c/knowledge-drafts/**`, with symlink traversal rejected. Read-only MCP (`memory` recall/search, `knowledge` read/find/etc.) SHALL be allowed; MCP mutations and unknown MCP tools SHALL be denied.

#### Scenario: Planning artifact write is allowed

- **WHEN** the agent writes a plan file under `.pi/1c/plans/`
- **THEN** the write is allowed

#### Scenario: Project code write is blocked in PLAN

- **WHEN** the agent tries to write a `.bsl`/metadata file outside the planning roots in PLAN
- **THEN** the write is blocked

### Requirement: BUILD enables implementation and executes an approved plan

In BUILD implementation SHALL be allowed. When the session holds a `plan-ready` artifact and enters execution, the exact `plan_id` and plan text SHALL be injected as a handoff and execution SHALL NOT restart full discovery unless new evidence invalidates a locked step. Leaving the execution phase SHALL stop re-injecting the plan handoff into unrelated BUILD turns.

#### Scenario: Approved plan is executed by id

- **WHEN** `/1c-execute-plan` runs against a `plan-ready` artifact
- **THEN** BUILD receives that plan_id and text and does not redo discovery from scratch

### Requirement: Session state restore is hardened

Restoring the mode state from a session record SHALL be defensive: a missing, malformed, or outdated record SHALL degrade to a valid default without throwing, an invalid mode/phase pair SHALL be normalised, a damaged plan object SHALL be dropped, and an out-of-range anonymous level SHALL degrade to 0 (off).

#### Scenario: Corrupt record does not crash session start

- **WHEN** the persisted mode-state record is malformed at `session_start`
- **THEN** the session starts in a valid default mode with anonymous level 0 and no exception

#### Scenario: Inconsistent plan phase is corrected

- **WHEN** a restored state claims `build-executing` or `plan-ready` but has no plan object
- **THEN** the phase is corrected to `build-idle` / `plan-draft` respectively

### Requirement: Anonymous session has four levels

The agent SHALL support anonymous-session levels 0–3 where 0 is off. Level 1 SHALL forbid writes to shared memory/knowledge (`memory_remember`, `knowledge_remember|write|edit|add_resource`) and to the local pending-memory queue. Level 2 SHALL additionally forbid reads of shared memory/knowledge (e.g. `memory_recall`, `knowledge_find|search|read|list|tree|grep|glob`), while liveness `*_health` stays allowed. Level 3 SHALL additionally make the session ephemeral (no transcript) and forbid handoff documents.

#### Scenario: Level 1 blocks a remember

- **WHEN** anon level is 1 and the agent attempts `memory_remember` or `knowledge_write`
- **THEN** the call is blocked and nothing is stored

#### Scenario: Level 2 blocks a recall

- **WHEN** anon level is 2 and the agent attempts `memory_recall` or `knowledge_find`
- **THEN** the read is blocked, while a `*_health` liveness call is still allowed

#### Scenario: Level 3 forbids handoff documents

- **WHEN** anon level is 3 and the agent attempts to write a handoff document
- **THEN** the write is blocked and the launcher runs the session ephemerally (no transcript)

### Requirement: Anonymous enforcement is double and fail-closed in every mode

Anonymous restrictions SHALL be enforced both by the `tool_call` hook (blocking the call) and by the `pi-mcp-adapter:tool-approval-request` hook (denying the resolved server/tool pair), independently of the current mode, including BUILD. A tool of the `memory` or `knowledge` server that is not on the read-only allowlist SHALL be treated as a write (fail-closed). The agent SHALL NOT claim anything was stored or queued when a write was attempted and blocked.

#### Scenario: Write blocked even in BUILD

- **WHEN** anon level ≥ 1 during a BUILD turn and a shared-memory write is attempted
- **THEN** both hooks deny it and no store or pending record is written

#### Scenario: Unknown memory tool is treated as a write

- **WHEN** anon level ≥ 1 and an unrecognised `memory`/`knowledge` tool is called
- **THEN** it is denied as a potential write

### Requirement: Anonymous surfaces and scope

The agent SHALL provide `/anon 1|2|3|off|status`, the `Ctrl+Alt+A` hotkey cycling off → 1 → 2 → 3 → off, the `--anon <level>` launch flag, and the `PI_1C_ANON` environment fallback. The footer SHALL always show `anon:off|1|2|3` next to the mode badge. The level SHALL be session-scoped: switching PLAN/BUILD/ASK SHALL NOT reset it, a NEW session SHALL always start at 0, and a resumed session SHALL keep its level.

#### Scenario: New session starts non-anonymous

- **WHEN** a brand-new session starts after an anonymous session ended
- **THEN** anon level is 0 and the normal shared-memory policy applies

#### Scenario: Mode switch preserves anon level

- **WHEN** the user switches from ASK to BUILD while anon level is 2
- **THEN** anon level stays 2

### Requirement: Anonymous trace paths are portable

The local trace roots blocked by ANON SHALL be expressed without machine-local absolute paths: the pending-memory root SHALL be `$PI_CODING_AGENT_DIR/state/agent-memory/pending/**` and the handoff root SHALL be the project `handoffs/**`. Shipped files SHALL NOT hardcode another machine's absolute path (e.g. `/mnt/vol_328/MCP/...`).

#### Scenario: No foreign absolute path is shipped

- **WHEN** the anon policy resolves its blocked roots
- **THEN** it uses `$PI_CODING_AGENT_DIR` and project-relative `handoffs/`, not a hardcoded developer-machine path

### Requirement: Anonymous session keeps the post-task memory policy coherent

While anonymous, the shared post-task memory policy SHALL be suspended rather than violated: instead of a memory write the agent SHALL end a substantial turn with `Memory: skipped — anonymous`, and SHALL NOT present a blocked write as recorded or queued. Non-memory obligations (secrets ban, project-file authority) SHALL still apply.

#### Scenario: Substantial anonymous turn reports skip

- **WHEN** a substantial task completes during an anonymous session
- **THEN** the turn reports `Memory: skipped — anonymous` and does not claim a store or a pending record

### Requirement: Enforcement host is Pi; Cursor is documentation-only

The mode and anonymous gates (write-block, tool hiding, MCP deny, anon deny) SHALL be enforced by the Pi `1c-mode` extension. The profile documentation SHALL state that Cursor loads the same `AGENTS.md` text but does not enforce these runtime gates, so the profile SHALL NOT claim identical enforcement across both hosts.

#### Scenario: README states the Cursor limit

- **WHEN** a user reads the profile README about ASK/ANON
- **THEN** it states that Cursor does not enforce the Pi runtime gates

### Requirement: Documentation reflects the modes in the same change

The overlay `AGENTS.md`, `rules-1c/core/modes.md`, and `README.md` SHALL describe ASK, ANON (levels and surfaces), and the ASK-by-default startup, consistently with the enforced behavior, updated in the same change as the implementation.

#### Scenario: Modes doc matches behavior

- **WHEN** the change is applied
- **THEN** `rules-1c/core/modes.md` documents ASK and ANON and states the default startup mode is ASK
