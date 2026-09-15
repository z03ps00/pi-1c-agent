## Purpose

Defines the mandatory contract for a single write to shared memory (Cognee) or knowledge (OpenViking) so that every stored record is redacted, deduplicated, correctly scoped, verifiably persisted, and reported with one consistent status line.

## ADDED Requirements

### Requirement: Canonical redaction before any write

The system SHALL redact secrets from a candidate record before it is written to Cognee, written to OpenViking, or saved as a pending record, using one shared redaction routine. Redaction MUST replace tokens, passwords, cookies, API keys, private keys, authorization headers, credentialed connection strings, and secret-store values with a `[REDACTED:<kind>]` marker. A record that still contains an unredactable secret MUST NOT be written.

#### Scenario: Secret is redacted before storage

- **WHEN** a candidate record contains an API key or password mixed with a durable fact
- **THEN** the stored record contains `[REDACTED:<kind>]` in place of the secret and retains only the non-sensitive durable fact

#### Scenario: Redaction applies to pending records too

- **WHEN** a write target is offline and the record is queued as a pending record
- **THEN** the pending record on disk is redacted with the same routine used for direct writes

#### Scenario: Unredactable secret blocks the write

- **WHEN** a candidate record cannot be reduced to a safe form without losing the secret
- **THEN** the system does not write the record and reports why

### Requirement: Idempotency key computed after redaction

The system SHALL compute the record `content_hash` as a hash of the already-redacted content, and form an `idempotency_key` of `task=<stable task or plan id>; agent=<agent/runtime>; date=<YYYY-MM-DD>; content_hash=<hash>`. The hash MUST reflect the exact bytes that will be stored, never the pre-redaction text.

#### Scenario: Hash reflects redacted content

- **WHEN** the idempotency key is computed for a record that was redacted
- **THEN** the `content_hash` matches the redacted content and changing a redacted secret does not change the hash

#### Scenario: Stable key across identical content

- **WHEN** the same durable content is captured twice on the same date for the same task and agent
- **THEN** both computations produce the same `idempotency_key`

### Requirement: Deduplication before write

The system SHALL search existing memory/knowledge and the local pending queue by `idempotency_key` before writing. When a record with the same key already exists, the system MUST NOT create a duplicate; it either skips the write or writes a superseding record per the maintenance rules, never a silent copy.

#### Scenario: Duplicate is not stored twice

- **WHEN** a record whose `idempotency_key` already exists is offered for writing
- **THEN** no duplicate record is created and the system reports the existing record

#### Scenario: Correction supersedes instead of duplicating

- **WHEN** the content for an existing subject changes and must be corrected
- **THEN** a new record is written that explicitly supersedes the prior one, and the prior record is not silently duplicated

### Requirement: Correlation between Cognee and OpenViking records

When a short fact is stored in Cognee and its detailed report is stored in OpenViking for the same event, the system SHALL assign both a shared `correlation_id` so the short fact can be navigated to its detailed report.

#### Scenario: Paired write shares a correlation id

- **WHEN** a capture writes a short fact to Cognee and a detailed report to OpenViking
- **THEN** both records carry the same `correlation_id`

#### Scenario: Single-target write still records its own id

- **WHEN** only one target is written
- **THEN** that record still carries a `correlation_id` usable to link a later paired record

### Requirement: Verify after write

After a write, the system SHALL confirm persistence by recalling the record by its `idempotency_key`. When the read-back confirms the record, the system reports it as recorded. When the read-back fails, the server is unavailable, or approval is not granted, the system MUST report the write as `UNCONFIRMED`, save a redacted pending record, and never present it as confirmed.

#### Scenario: Confirmed write

- **WHEN** a write completes and a recall by key returns the record
- **THEN** the system reports the record as recorded

#### Scenario: Unconfirmed write is queued

- **WHEN** a write is attempted but read-back fails or the server is unavailable
- **THEN** the system saves a redacted pending record and reports `UNCONFIRMED`, not recorded

### Requirement: Canonical project scope

The system SHALL derive a single canonical `project-id` for project-scoped records from a stable source (git remote or a `.pi/1c/project-id` marker) and MUST normalize it so incidental path differences — including a trailing space in the working-directory path — resolve to the same id. A project-specific fact MUST NOT be written into another project's scope.

#### Scenario: Trailing-space path resolves to one id

- **WHEN** the working directory path differs only by a trailing space or bind-mount prefix
- **THEN** the derived `project-id` is identical for both paths

#### Scenario: No cross-project leak

- **WHEN** a project-specific fact is stored
- **THEN** it is scoped to that project's `project-id` and is not written to another project's scope

### Requirement: Unified memory status reporting

For a substantial task the system SHALL end the response with exactly one memory status line reporting recall and save outcomes (recalled count or nothing relevant; saved count, `UNCONFIRMED`, or nothing to save). This single line MUST replace divergent per-source phrasings so Pi-native skills and the upstream recall-first expectation report identically. In an anonymous session the line MUST read `Memory: skipped — anonymous` and MUST NOT claim a recorded or queued write.

#### Scenario: Substantial task reports one status line

- **WHEN** a substantial task completes with a memory write
- **THEN** the response ends with a single line stating recall and save outcomes

#### Scenario: Anonymous session reports skipped

- **WHEN** the session is anonymous and a substantial task completes
- **THEN** the status line reads `Memory: skipped — anonymous` and no write is claimed

### Requirement: Anonymous mode covers every mutator

The anonymous-session block SHALL deny every mutating memory/knowledge tool, driven by a maintained list of Cognee/OpenViking mutator tool names rather than an ad-hoc pattern. A contract check MUST fail if a known mutator is not covered by the anonymous block.

#### Scenario: Known mutator is blocked

- **WHEN** an anonymous session (level 1 or higher) attempts any listed memory/knowledge mutator
- **THEN** the call is denied

#### Scenario: New mutator without coverage fails the contract check

- **WHEN** a mutator tool name is present in the maintained list but not covered by the anonymous block
- **THEN** the contract check fails so the gap is caught before release
