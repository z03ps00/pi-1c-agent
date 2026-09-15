## Purpose

Lets a user refresh the installed Pi 1C profile on this PC from their own git remote, without touching a 1C project and without wiping local secrets or MCP/settings customizations.

## ADDED Requirements

### Requirement: Settings command updates the installed profile, not a 1C project

The profile SHALL expose a settings-tier command `/update-profile` whose target is the installed Pi 1C profile (`$PI_CODING_AGENT_DIR`, or the loaded profile root when that variable is unset). The command MUST NOT dump, load, or otherwise mutate a 1C infobase, MUST NOT run a project `install.ps1`, and MUST NOT use the current working directory as the target when that directory is a 1C project. `/1c-update-profile` MUST remain a one-release alias that states it is an alias of `/update-profile`. `/commands` MUST list `/update-profile` under Settings, not Everyday, and MUST NOT count it toward the everyday twelve-command bound.

#### Scenario: Catalog places the command in Settings

- **WHEN** the user runs `/commands` with no arguments
- **THEN** `/update-profile` appears in the Settings section
- **AND** it does not appear in Everyday or Maintainer

#### Scenario: Alias names the canonical command

- **WHEN** the user runs `/1c-update-profile`
- **THEN** the same update procedure runs
- **AND** the agent states once that it is an alias of `/update-profile`

#### Scenario: A 1C project cwd is not the target

- **WHEN** the user is working in a 1C project directory and runs `/update-profile`
- **THEN** the update targets the Pi profile root, not the project
- **AND** project files including `.dev.env` are left unchanged

### Requirement: Source is the clone’s git remote

`/update-profile` SHALL refresh tracked profile files from the profile clone’s configured git remote. The default remote MUST be `origin`. The default ref MUST be the current branch’s upstream if it exists, otherwise `origin/HEAD`, otherwise `origin/main`. An optional argument MAY name a remote ref (branch or tag). The command MUST NOT substitute `comol/ai_rules_1c`, a GitHub release archive, or a hardcoded foreign URL when `origin` is configured. If `git` is missing, or the profile root is not a git clone, or no usable remote exists, the command MUST stop, say why, and print host copy-paste commands — it MUST NOT retry in a loop and MUST NOT clone into a new directory.

#### Scenario: Default pull uses origin

- **WHEN** the profile is a git clone with `origin` and a clean tracking branch
- **AND** the user runs `/update-profile` with no arguments
- **THEN** the command fetches from `origin` and updates the current branch to the default ref

#### Scenario: Missing git is a hard stop

- **WHEN** `git` is not on PATH
- **THEN** the command does not mutate profile files
- **AND** it prints copy-paste host commands once and stops

#### Scenario: Not a clone is a hard stop

- **WHEN** the profile root has no `.git` or has no usable remote
- **THEN** the command does not mutate files
- **AND** it tells the user to clone the remote into `$PI_CODING_AGENT_DIR` per README instead of inventing a URL

### Requirement: Fast-forward by default; dirty trees do not overwrite

A default `/update-profile` MUST be a fast-forward of a clean working tree. If tracked files differ from `HEAD`, or the update would not be a fast-forward, the command MUST stop, list the blocking paths or commits, and leave the tree unchanged. Overwrite of tracked local edits MUST happen only when the same invocation carries an explicit confirmation argument (`force` / `overwrite` / a clearly documented confirm token). Untracked gitignored files MUST NOT be deleted by the update.

#### Scenario: Clean and behind updates

- **WHEN** the working tree is clean and the branch can fast-forward to the remote ref
- **THEN** tracked profile files match that ref after the command
- **AND** the report names the old and new commit SHAs

#### Scenario: Dirty tree is refused

- **WHEN** tracked files in the profile have uncommitted edits
- **AND** the user runs `/update-profile` without a confirm argument
- **THEN** no tracked file is changed
- **AND** the report lists the dirty paths

#### Scenario: Already up to date is a no-op success

- **WHEN** fetch shows the current branch already matches the default ref
- **THEN** the command reports that the profile is current
- **AND** it does not rewrite profile files

### Requirement: Local secrets and opt-in customizations survive the update

After a successful update, `auth.json` and `trust.json` MUST be unchanged. Every MCP server that was registered in `mcp.json` before the update and is not part of the incoming shipped default MUST still be registered. If `settings.json` `packages` already contained a local filesystem path for the `pi-1c-agent` package (not the shipped placeholder), that path MUST still be present. The command MUST NOT copy secrets into the reply, handoffs, or reports. Credentialed remote URLs MUST be redacted in output.

#### Scenario: Secrets files are untouched

- **WHEN** `auth.json` and `trust.json` exist in the profile root
- **AND** `/update-profile` completes successfully
- **THEN** both files are byte-identical to their pre-update contents

#### Scenario: Opted-in MCP servers remain

- **WHEN** `mcp.json` contained an opted-in server that is not in the shipped default
- **AND** `/update-profile` completes successfully
- **THEN** that server is still present in `mcp.json`

#### Scenario: Local package path remains

- **WHEN** `settings.json` packages listed a local path instead of `<path-to-pi-1c-agent>`
- **AND** `/update-profile` completes successfully
- **THEN** that local path is still listed in `packages`

### Requirement: npm packages are not auto-updated

`/update-profile` MUST update git-tracked profile files only. It MUST NOT run `pi install`, `npm install`, or otherwise change `npm/` / `node_modules`. After a successful git update it MAY remind the user of the documented Cursor SDK refresh command. A missing Cursor SDK MUST remain a `/doctor` WARN, not a failure of `/update-profile`.

#### Scenario: Successful profile update does not touch npm

- **WHEN** `/update-profile` completes successfully
- **THEN** `npm/` and `node_modules` are unchanged by this command
- **AND** the report may mention `pi install npm:pi-cursor-sdk` as a separate optional step

### Requirement: Status check and doctor warn without mutating

`/update-profile status` (and `check`) MUST be read-only: report whether the clone is behind, ahead, dirty, or has no remote, then stop. `/doctor` MUST WARN (not FAIL CORE) when the profile is a git clone that is behind its default remote ref, or when it has no usable remote, and MUST name `/update-profile` as the refresh command. `/updaterules` and `/checkupdates` MUST remain 1C-project commands. The `/updaterules` prompt MUST mention `/update-profile` as the way to refresh this profile from the owner’s git remote.

#### Scenario: Status does not write

- **WHEN** the user runs `/update-profile status`
- **THEN** no profile file is created, modified, or deleted
- **AND** the report states behind, ahead, dirty, current, or no-remote

#### Scenario: Doctor names the refresh command

- **WHEN** `/doctor` runs against a profile clone that is behind `origin`
- **THEN** the result includes a WARN (not FAIL CORE)
- **AND** the WARN names `/update-profile`

### Requirement: Distinct from project rules and Comol review

`/update-profile` MUST NOT be an alias of `/updaterules`, `/checkupdates`, or `/review-airules`. Running `/update-profile` MUST NOT apply `comol/ai_rules_1c` via `install.ps1` and MUST NOT change `upstream.lock.json` except when that file changed in the fetched git ref as part of the tracked tree.

#### Scenario: Updaterules is not reused

- **WHEN** the user runs `/update-profile`
- **THEN** the agent does not execute project `install.ps1`
- **AND** it does not start the `/review-airules` Comol review flow
