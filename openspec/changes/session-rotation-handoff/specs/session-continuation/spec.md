## Purpose

Defines an opt-in behavior where the Pi 1C agent, near a context-window threshold, saves a session handoff and continues the task in a fresh session instead of compacting older turns in place, so late-task quality does not degrade inside an overfull window.

## ADDED Requirements

### Requirement: Session rotation is opt-in and off by default

The system SHALL provide a session-rotation capability that is disabled by default. When disabled, the agent's context handling MUST be identical to current behavior (Pi in-place compaction plus the manual handoff skill). The capability MUST be enabled or disabled by explicit user action and MUST NOT turn itself on.

#### Scenario: Feature off by default

- **WHEN** a session starts and the user has never enabled session rotation
- **THEN** the agent uses normal in-place compaction and never rotates sessions automatically

#### Scenario: User disables the feature

- **WHEN** the user disables session rotation while it was enabled
- **THEN** the agent stops rotating on threshold and reverts to normal in-place compaction for the rest of the session

### Requirement: Toggle and configuration command

The system SHALL expose a settings-tier command to enable, disable, inspect, and set the threshold of session rotation. The command MUST report the current on/off state and effective threshold. The threshold MUST be an integer percentage of the context window that the user can change; if the user supplies no threshold, the system MUST use a default of 85 percent.

#### Scenario: Enable with default threshold

- **WHEN** the user enables session rotation without naming a percentage
- **THEN** the feature becomes enabled with a threshold of 85 percent and the command confirms both

#### Scenario: Set a custom threshold

- **WHEN** the user sets the threshold to a valid percentage (for example 80)
- **THEN** that value becomes the effective threshold and is reported by the status action

#### Scenario: Reject an invalid threshold

- **WHEN** the user sets a threshold outside the valid range (not an integer between 50 and 95 inclusive)
- **THEN** the command rejects it, keeps the previous threshold, and explains the allowed range

#### Scenario: Query status

- **WHEN** the user requests session-rotation status
- **THEN** the command reports enabled/disabled and the effective threshold without changing anything

### Requirement: State persists across the session lifecycle

The enabled/disabled state and the effective threshold SHALL persist in Pi session state so they survive compaction, resume, and a rotation into a new session. A rotation MUST carry the current enabled state and threshold into the new session.

#### Scenario: Rotation preserves the setting

- **WHEN** the agent rotates into a new session while the feature is enabled at a custom threshold
- **THEN** the new session starts with session rotation still enabled at the same threshold

#### Scenario: Setting survives resume

- **WHEN** the user resumes a session in which rotation was enabled
- **THEN** the resumed session reports rotation enabled at the previously configured threshold

### Requirement: Threshold detection triggers rotation instead of compaction

When the feature is enabled, the system SHALL measure context usage as a percentage of the active model's context window and, when usage reaches or exceeds the threshold, perform a session rotation rather than in-place compaction. The system MUST NOT rotate while the agent is mid-turn/streaming; it MUST wait until the agent is idle. When context usage is below the threshold, the system MUST NOT rotate.

#### Scenario: Threshold crossed at idle

- **WHEN** the feature is enabled and, after a turn completes, context usage is at or above the threshold
- **THEN** the agent performs a session rotation before accepting further work

#### Scenario: Below threshold

- **WHEN** the feature is enabled and context usage stays below the threshold
- **THEN** no rotation happens and the session continues normally

#### Scenario: Context usage unknown

- **WHEN** the feature is enabled but context usage cannot be determined (for example immediately after a compaction, before the next model response)
- **THEN** the agent does not rotate on that check and re-evaluates on the next idle check

### Requirement: Rotation writes a handoff before starting a new session

Before rotating, the system SHALL produce a handoff document using the existing handoff format (session goal, current state, files changed this session, verification state, next steps, and what to load next). The handoff MUST be written to the project handoff location and MUST NOT contain secrets, credentials, `.dev.env` contents, or full transcript/tool-output dumps. The rotation MUST NOT proceed if the handoff was not written.

#### Scenario: Handoff produced then rotate

- **WHEN** a rotation is triggered
- **THEN** the agent writes a handoff file in the handoff location and only then opens the new session

#### Scenario: Handoff omits secrets

- **WHEN** the rotation handoff is written
- **THEN** it references durable artifacts and next steps but contains no passwords, tokens, connection strings, or `.dev.env` values

#### Scenario: Handoff write fails

- **WHEN** the handoff cannot be written (for example the location is not writable)
- **THEN** the rotation is aborted, the agent reports the failure, and normal compaction remains available as a fallback

### Requirement: New session continues the task from the handoff

The system SHALL start a new session with a clean context window, record the previous session as its parent, and seed it with a kickoff instruction that points to the handoff file and directs the agent to continue the task without repeating completed discovery. The new session MUST begin below the rotation threshold.

#### Scenario: Kickoff references the handoff

- **WHEN** the new session starts after a rotation
- **THEN** its first instruction names the handoff file path and tells the agent to continue the remaining work from it

#### Scenario: Parent linkage recorded

- **WHEN** a rotation creates the new session
- **THEN** the new session records the previous session as its parent for traceability

### Requirement: Compaction remains the fallback for oversized single turns

The system SHALL keep in-place compaction as a safety fallback so that a single turn which overflows the context window is never dropped. Suppression of the normal compaction path MUST apply only to the threshold-triggered case while the agent is idle; overflow-driven compaction MUST still be allowed, with rotation performed afterward at the next idle point.

#### Scenario: Overflow during a turn

- **WHEN** a single turn grows large enough to trigger overflow compaction while the feature is enabled
- **THEN** in-place compaction runs to protect that turn, and rotation is deferred until the agent is idle

#### Scenario: Threshold case suppresses in-place compaction

- **WHEN** the idle threshold check triggers a rotation
- **THEN** the normal in-place compaction for that event is suppressed exactly once so the same context is not both compacted and rotated

### Requirement: Behavior is Pi-only and documented as a dual-host gap

The capability SHALL be implemented in the Pi runtime and documented as unavailable under Cursor, which does not expose the required context-usage and session-lifecycle hooks. Documentation MUST state that with the feature enabled the behavior applies only in Pi.

#### Scenario: Cursor host

- **WHEN** the same profile is loaded under Cursor
- **THEN** session rotation does not activate and the documentation explains it is a Pi-only option
