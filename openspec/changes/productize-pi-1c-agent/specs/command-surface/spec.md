## Purpose

Defines the product slash-command catalog: everyday vs settings vs maintainer, unprefixed 1C verbs, collision-safe names, one init wizard, and one doctor.

## ADDED Requirements

### Requirement: Everyday product catalog is bounded

The profile SHALL expose a default everyday catalog of at most twelve commands covering commands-help, init, doctor, tool install menu, MCP status, PLAN/BUILD via `/mode`, load, update, deploy, and release. Settings and maintainer commands MUST remain invocable by exact name but MUST NOT appear in the `/commands` everyday section.

#### Scenario: Commands lists everyday first

- **WHEN** the user runs `/commands` with no arguments
- **THEN** the agent lists the everyday catalog first, then a short settings section, then a maintainer section marked as advanced

#### Scenario: Maintainer command still works by name

- **WHEN** the user runs an advanced command such as `/evolve` or `/review-airules` by exact name
- **THEN** the command still runs and the reply states that it is a maintainer command

### Requirement: Canonical names have no 1c- prefix

1C verbs MUST use unprefixed names that match upstream `ai_rules_1c` where a command exists there (`/init`, `/initproject`, `/doctor`, `/installmcp`, `/installtools`, `/checkmcp`, `/install-cognee`, `/install-openviking`, `/loadfrom1cbase`, `/update1cbase`, `/deploy-and-test`, `/build-release`, `/updaterules`, `/checkupdates`). Profile-only maintainer sync is `/review-airules` (not `/1c-review-airules`). Prompt filenames MUST match those names (e.g. `prompts/installmcp.md` → `/installmcp`). For one minor release, `/1c-*` MUST remain working aliases that print “alias of `/…`” once.

The profile MUST NOT register `/help`, `/plan`, `/debug`, `/new`, `/login`, `/trust`, `/reload`, `/model`, `/settings`, `/session` as 1C commands. Catalog help is `/commands`. PLAN/BUILD switch remains `/mode plan|build`; the profile MUST NOT add a competing `/plan` or `/build` prompt.

#### Scenario: Review airules is unprefixed

- **WHEN** the user runs `/review-airules`
- **THEN** the Comol impact review runs; `/1c-review-airules` during the alias window is the same command

#### Scenario: Install MCP is unprefixed

- **WHEN** the user runs `/installmcp`
- **THEN** the purchased-bundle installer runs (not a missing-command error)

#### Scenario: Old prefixed name still works

- **WHEN** the user runs `/1c-installmcp` during the alias window
- **THEN** the same installer runs and the agent states it is an alias of `/installmcp`

#### Scenario: Cursor help is not stolen

- **WHEN** the user types `/help` in Cursor
- **THEN** that is Cursor’s help, not this profile’s catalog; the 1C catalog is `/commands`

### Requirement: One init wizard with an explicit source choice

`/init` MUST ask, as its first interactive question, whether the user wants an empty source scaffold or a dump from an existing infobase / `.cf` / `.dt`. `/initproject` MUST be only a thin alias that jumps to the dump scenario. Palette descriptions MUST use distinct wording: empty layout versus import from infobase.

#### Scenario: Empty project path

- **WHEN** the user chooses empty scaffold in `/init`
- **THEN** the wizard configures project data (`.dev.env` and project manifest) and optional empty `cf`/`cfe`/`epf`/`erf` directories and MUST NOT dump an infobase

#### Scenario: From-IB alias

- **WHEN** the user runs `/initproject`
- **THEN** the flow is the from-infobase scenario of `/init` and the agent states that `/initproject` is an alias for that scenario

### Requirement: Single doctor command

`/doctor` MUST mean the deterministic profile/package health check. The inherited LLM 1c-rules diagnostic MUST NOT share that name. If it remains, it MUST be `/doctor-explain`.

#### Scenario: Doctor name is unique

- **WHEN** the user runs `/doctor`
- **THEN** exactly one registered command runs and it is the deterministic health check

### Requirement: Command titles match palette names

Every prompt the palette loads MUST use the canonical unprefixed name in its title and body (`/installmcp`, not `/1c-installmcp` and not a mix). Docs MUST use the canonical name and may mention the `/1c-*` alias.

#### Scenario: User follows a prompt heading

- **WHEN** the user opens `prompts/installmcp.md`
- **THEN** the heading and body refer to `/installmcp`

### Requirement: Destructive infobase commands confirm the target

`/update1cbase`, `/restore-testbase`, `/deploy-and-test`, and `/build-release` MUST name the target infobase from `.dev.env` and require explicit user confirmation before mutating that infobase, unless the same invocation already carried an explicit confirmation argument.

#### Scenario: Update asks before load

- **WHEN** the user runs `/update1cbase` against a configured test infobase
- **THEN** the agent prints the resolved infobase identity and waits for confirmation before loading configuration
