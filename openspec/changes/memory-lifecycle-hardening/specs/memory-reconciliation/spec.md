## Purpose

Gives the pending-memory queue a full lifecycle so records that could not be confirmed when written are later replayed to Cognee/OpenViking and marked confirmed, instead of accumulating forever on disk.

## ADDED Requirements

### Requirement: Pending records have a defined lifecycle

The system SHALL treat `state/agent-memory/pending/**` as a queue of not-yet-confirmed records, each carrying its `idempotency_key`, target server, and `status`. A pending record MUST remain until it is either confirmed (moved to a `done` location or marked confirmed in place) or explicitly superseded. Confirming a record MUST NOT delete history.

#### Scenario: Pending record retained until resolved

- **WHEN** a record is queued as pending because a write was unconfirmed
- **THEN** it stays in the pending queue with its key and status until it is confirmed or superseded

#### Scenario: Confirmation preserves history

- **WHEN** a pending record is confirmed
- **THEN** it is moved to a `done` location or marked confirmed and its content is not lost

### Requirement: Startup reconciliation

When Cognee and/or OpenViking are opted in and reachable, the system SHALL, at the start of a meaningful session, reconcile the pending queue: for each pending record, check for a duplicate by `idempotency_key`, write it to its target when absent, verify it, and mark it confirmed. When the target is unavailable the record MUST stay pending and reconciliation MUST NOT loop or fail the task.

#### Scenario: Pending drains when server is back

- **WHEN** a session starts, the memory server is reachable, and a redacted pending record exists that is not yet stored
- **THEN** the record is written, verified, and marked confirmed

#### Scenario: Duplicate pending record is not re-stored

- **WHEN** a pending record's `idempotency_key` already exists on the target
- **THEN** the record is marked confirmed without creating a duplicate

#### Scenario: Server still offline leaves the queue intact

- **WHEN** the memory server is unreachable at reconciliation time
- **THEN** the pending record is left untouched, the condition is reported once, and no retry loop runs

### Requirement: Manual reconciliation command

The system SHALL expose a command to reconcile the pending queue on demand and to report its state. The command MUST report how many records were confirmed, how many remain pending, and how many were skipped as duplicates, and MUST make no writes when the target is unavailable or the session is anonymous.

#### Scenario: Command reports reconciliation outcome

- **WHEN** the user runs the reconciliation command with the server reachable
- **THEN** it reports counts of confirmed, still-pending, and duplicate-skipped records

#### Scenario: Command respects anonymous mode

- **WHEN** the reconciliation command runs in an anonymous session
- **THEN** it makes no writes and reports that reconciliation is skipped for anonymity
