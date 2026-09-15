## Purpose

Closes the `/1c-*` alias window and assigns `/init` / `/doctor` to the Pi package.

## MODIFIED Requirements

### Requirement: Canonical names have no 1c- prefix

1C verbs MUST use unprefixed names that match upstream `ai_rules_1c` where a command exists there (`/init`, `/initproject`, `/doctor`, `/installmcp`, `/installtools`, `/checkmcp`, `/install-cognee`, `/install-openviking`, `/loadfrom1cbase`, `/update1cbase`, `/deploy-and-test`, `/build-release`, `/updaterules`, `/checkupdates`). Profile-only maintainer sync is `/review-airules`. Prompt filenames MUST match those names (e.g. `prompts/installmcp.md` → `/installmcp`). The palette MUST NOT register `/1c-*` aliases. Package-owned verbs (`/init`, `/doctor`, `/session-rotate`, `/mode`, `/anon`, and the other `registerCommand` names in `pi-1c-agent`) MUST NOT also have a `prompts/<name>.md` — that registers the same slash name twice.

The profile MUST NOT register `/help`, `/plan`, `/debug`, `/new`, `/login`, `/trust`, `/reload`, `/model`, `/settings`, `/session` as 1C commands. Catalog help is `/commands`. PLAN/BUILD switch remains `/mode plan|build`; the profile MUST NOT add a competing `/plan` or `/build` prompt.

#### Scenario: Review airules is unprefixed

- **WHEN** the user runs `/review-airules`
- **THEN** the Comol impact review runs
- **AND** `/1c-review-airules` is not a registered command

#### Scenario: Install MCP is unprefixed

- **WHEN** the user runs `/installmcp`
- **THEN** the purchased-bundle installer runs (not a missing-command error)

#### Scenario: Prefixed name is not registered

- **WHEN** the user types `/1c-installmcp`
- **THEN** the palette does not list a `/1c-installmcp` command

#### Scenario: Package-owned session-rotate is not a prompt

- **WHEN** the user opens the `/` palette
- **THEN** `/session-rotate` appears once (the `pi-1c-agent` extension)
- **AND** `prompts/session-rotate.md` does not exist

#### Scenario: Cursor help is not stolen

- **WHEN** the user types `/help` in Cursor
- **THEN** that is Cursor’s help, not this profile’s catalog; the 1C catalog is `/commands`

### Requirement: Command titles match palette names

Every prompt the palette loads MUST use the canonical unprefixed name in its title and body (`/installmcp`, not `/1c-installmcp` and not a mix). Docs MUST use the canonical name and MUST NOT mention a `/1c-*` alias window.

#### Scenario: User follows a prompt heading

- **WHEN** the user opens `prompts/installmcp.md`
- **THEN** the heading and body refer to `/installmcp`
