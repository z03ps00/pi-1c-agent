## Purpose

Defines how the Pi 1C agent edits Russian AI-written prose with the Humanizer RU skill from the profile, without installing it into each 1C project or running it on every coding task.

## ADDED Requirements

### Requirement: Profile ships Humanizer RU, not English humanizer

The profile MUST ship the Cursor `humanizer-ru` tree under `$PI_CODING_AGENT_DIR/skills/humanizer-ru/`, including `SKILL.md`, `references/`, `knowledge/`, and license notices. The English `humanizer` skill MUST NOT be copied as a substitute. The agent MUST load `humanizer-ru` for Russian «очеловечь» / канцелярит / «звучит как нейросеть» requests, and MUST NOT use the English Wikipedia-pattern `humanizer` for those Russian requests.

#### Scenario: User asks to humanize Russian text

- **WHEN** the user says «очеловечь», «убери канцелярит», or «звучит как нейросеть» about Russian prose
- **THEN** the agent loads `humanizer-ru` from the profile skills directory

#### Scenario: English humanizer is not the Russian path

- **WHEN** the profile is asked to edit Russian IT/1C prose
- **THEN** it does not apply the English `humanizer` skill as the editor

### Requirement: Editor preserves facts and author voice

When `humanizer-ru` applies, the agent MUST keep numbers, dates, names, versions, sums, links, and quotes unchanged, MUST NOT invent facts, and MUST follow the skill’s objective-vs-taste split (fix defects; propose taste separately). Owner `knowledge/corrections.md` and `knowledge/voice-author.md` MUST outrank default catalog voice when the text is the owner’s. Legal and fiction genres MUST be refused or limited to audit as the skill states.

#### Scenario: Numbers survive the edit

- **WHEN** the source text contains a version, a sum, or a URL
- **THEN** the edited text still contains those exact values

#### Scenario: Clean text is left alone

- **WHEN** audit finds no catalog defects
- **THEN** the agent returns the text unchanged and says it is clean

### Requirement: Humanizer does not bloat the 1C project

`/init` MUST ask whether this project wants Humanizer RU auto-use for Russian user-facing prose. Silence MUST NOT be Yes. Neither Yes nor No MAY copy the skill into the project or download the optional Python linter. Yes MAY record only a project preference. No (or absent preference) MUST limit Humanizer to an explicit user request. The extra MUST be enableable later without full `/init`. The optional linter MUST NOT be required at init and MUST NOT run unless tools (`uv` / `humanizer-ru` / Python) are actually available.

#### Scenario: User declines Humanizer at init

- **WHEN** the user answers No / 0 to Humanizer RU
- **THEN** Apply writes no skill copy, no linter install, and no auto-use flag

#### Scenario: Ordinary BSL work does not run Humanizer

- **WHEN** the user asks only to edit a manager module and did not ask to humanize Russian prose
- **THEN** the agent does not run the Humanizer RU edit loop

#### Scenario: Later explicit request still works

- **WHEN** Humanizer was declined at init and the user later pastes Russian text and says «очеловечь»
- **THEN** the agent edits with the profile skill and does not require a project-local install
