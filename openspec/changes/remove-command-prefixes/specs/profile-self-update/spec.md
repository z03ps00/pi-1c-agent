## Purpose

`/update-profile` has no `/1c-*` alias.

## MODIFIED Requirements

### Requirement: Settings command updates the installed profile, not a 1C project

The profile SHALL expose a settings-tier command `/update-profile` whose target is the installed Pi 1C profile (`$PI_CODING_AGENT_DIR`, or the loaded profile root when that variable is unset). The command MUST NOT dump, load, or otherwise mutate a 1C infobase, MUST NOT run a project `install.ps1`, and MUST NOT use the current working directory as the target when that directory is a 1C project. `/1c-update-profile` MUST NOT be registered. `/commands` MUST list `/update-profile` under Settings, not Everyday, and MUST NOT count it toward the everyday twelve-command bound.

#### Scenario: Catalog places the command in Settings

- **WHEN** the user runs `/commands` with no arguments
- **THEN** `/update-profile` appears in the Settings section
- **AND** it does not appear in Everyday or Maintainer

#### Scenario: Prefixed alias is absent

- **WHEN** the user types `/1c-update-profile`
- **THEN** that name is not a registered command

#### Scenario: A 1C project cwd is not the target

- **WHEN** the user is working in a 1C project directory and runs `/update-profile`
- **THEN** the update targets the Pi profile root, not the project
- **AND** project files including `.dev.env` are left unchanged
