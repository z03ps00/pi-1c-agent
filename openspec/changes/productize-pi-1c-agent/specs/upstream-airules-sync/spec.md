## Purpose

Lets the Pi 1C profile review new `comol/ai_rules_1c` releases, show their impact on this repository, and install selected pieces only after an explicit install plan, while recording each applied batch in a profile update register. Canonical command names have no `1c-` prefix.

## ADDED Requirements

### Requirement: Maintainer review command is read-only

The profile SHALL expose `/review-airules` as a maintainer command (filename `prompts/review-airules.md`). `/1c-review-airules` MAY exist as an alias for one release. Running it MUST compare the last applied upstream pin with the current `comol/ai_rules_1c` default branch (or an explicit ref the user supplied) and MUST NOT copy files, rewrite rules, change the pin, or append the update register.

#### Scenario: Review does not mutate the profile

- **WHEN** the user runs `/review-airules` and GitHub is reachable
- **THEN** the agent prints the impact report and asks whether to create an install plan
- **AND** the register, pin, `rules-1c/`, `skills/`, `prompts/`, and `agents/` are unchanged

#### Scenario: Everyday catalog does not list the command

- **WHEN** the user runs `/commands` with no arguments and a product catalog exists
- **THEN** `/review-airules` appears under maintainer, not in the everyday list

### Requirement: Impact report names the delta and the local effect

The report MUST include: the SHA range (last applied pin → reviewed ref), a short list of upstream commits, what is new or changed (skills, prompts, rules, agents, other), a proposed classification of each item as copy, adapt, or skip, the profile paths that would change, and any new dependencies (MCP servers, packages, sibling files). It MUST state that this is the Pi profile, not a 1C project `/updaterules` run.

#### Scenario: Updates exist since the pin

- **WHEN** upstream HEAD is ahead of the last applied pin
- **THEN** the report lists the SHA range, at least the newest commit subjects, each candidate item with copy/adapt/skip, and the matching paths in this repository

#### Scenario: Profile is already at the reviewed ref

- **WHEN** the last applied pin equals the reviewed ref
- **THEN** the report says there is nothing new to install and does not offer an install plan

#### Scenario: GitHub is unreachable

- **WHEN** the remote cannot be queried
- **THEN** the agent says the check failed and MUST NOT claim the profile is up to date

### Requirement: Install happens only after an accepted plan

After a non-empty report, the command MUST offer to create an install plan and MUST NOT install in the same turn. The plan MUST list the selected items, destination paths, copy vs adapt, dependencies, and verification. Apply (file copies, adaptations, register append, pin advance) MUST wait for an explicit later request to execute that plan (`/opsx-apply` or `/execute-plan` with the same plan id).

#### Scenario: User declines a plan

- **WHEN** the report shows updates and the user declines creating a plan
- **THEN** no plan file is written and no upstream content is installed

#### Scenario: User accepts a plan

- **WHEN** the user asks to create an install plan from the report
- **THEN** the agent writes planning artifacts only (OpenSpec change and/or `.pi/1c/plans/**`)
- **AND** profile skills, rules, and the register remain unchanged until the user later asks to apply that plan

#### Scenario: User can select a subset

- **WHEN** the user accepts a plan but names only some reported items
- **THEN** the plan contains those items and records the rest of the SHA range as skip candidates

### Requirement: Profile update register records applied batches

The profile SHALL keep a durable update register in the agent profile (human-readable `UPSTREAM-REGISTER.md` plus a machine-readable pin). After a planned batch is applied, the register MUST record: date, source repository, from-SHA, to-SHA, each item (source path, destination path, action copy/adapt/skip), and dependencies added. The pin MUST then equal `to-SHA`. The first shipped pin MUST be `410951e74fd3e6b7a763cf49757935b9a34d3f31`.

#### Scenario: Apply appends a register entry

- **WHEN** an accepted airules install plan is applied
- **THEN** a new register entry lists every planned item with its action and dependencies
- **AND** the machine-readable pin equals the plan’s `to-SHA`

#### Scenario: Acknowledge-and-skip advances the pin

- **WHEN** the user applies a plan that only acknowledges the range and skips remaining items
- **THEN** the register records those items as skip
- **AND** the pin advances so the next review starts after that range

#### Scenario: Review uses the pin, not git guesswork

- **WHEN** `/review-airules` runs
- **THEN** the compared from-SHA is the pin’s last applied SHA, not a guessed date or `updatedAt` from a project `.ai-rules.json`

### Requirement: Pi overlay and project updaterules stay out of the bulk copy

The review MUST classify Pi-native overlay (`rules-1c/core/*`, profile `AGENTS.md` markers, default `mcp.json` policy) as skip unless the user explicitly includes an item. `/updaterules` and `/checkupdates` MUST remain the 1C-project ruleset/MCP-image commands and MUST NOT be the profile-sync path. Profile sync MUST NOT run upstream `install.ps1` against this tree. New upstream command files MUST land as unprefixed `prompts/<name>.md`, not `prompts/1c-<name>.md`.

#### Scenario: Overlay files are not offered as copy

- **WHEN** upstream changed a file that this profile replaced with a Pi overlay
- **THEN** the report marks it adapt or skip, not copy

#### Scenario: Project updaterules is not used on the profile

- **WHEN** the user asks to refresh Comol rules for this profile
- **THEN** the agent uses `/review-airules`, not `/updaterules`

#### Scenario: New upstream command has no 1c- prefix

- **WHEN** an install plan copies a new upstream command `content/commands/previewmode.md`
- **THEN** the destination is `prompts/previewmode.md` (`/previewmode`), not `prompts/1c-previewmode.md`
