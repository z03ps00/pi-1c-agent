## Purpose

Mode switching uses `/mode` only. Prefixed plan/build/execute commands are gone.

## MODIFIED Requirements

### Requirement: Mode switching surfaces

The agent SHALL provide `/mode plan|build|ask` and the `Ctrl+Alt+P` hotkey that cycles BUILD → PLAN → ASK → BUILD. It MUST NOT register `/1c-plan`, `/1c-build`, `/1c-ask`, or `/1c-execute-plan`. A mode change requested while a run is in flight SHALL take effect only on the next run, and the agent SHALL say so instead of contradicting the in-flight answer.

#### Scenario: Command switches mode

- **WHEN** the user runs `/mode ask`
- **THEN** the session enters ASK and the footer reflects it

#### Scenario: Hotkey cycles all three modes

- **WHEN** the user presses `Ctrl+Alt+P` three times starting from BUILD
- **THEN** the mode goes BUILD → PLAN → ASK → BUILD

#### Scenario: Prefixed mode commands are absent

- **WHEN** the user types `1c-plan` or `1c-build` in the palette
- **THEN** those names are not registered commands

### Requirement: BUILD enables implementation and executes an approved plan

In BUILD implementation SHALL be allowed. When the session holds a `plan-ready` artifact and the user switches with `/mode build`, the exact `plan_id` and plan text SHALL be injected as a handoff and execution SHALL NOT restart full discovery unless new evidence invalidates a locked step. Leaving the execution phase SHALL stop re-injecting the plan handoff into unrelated BUILD turns.

#### Scenario: Approved plan is executed by id

- **WHEN** `/mode build` runs against a `plan-ready` artifact
- **THEN** BUILD receives that plan_id and text and does not redo discovery from scratch
