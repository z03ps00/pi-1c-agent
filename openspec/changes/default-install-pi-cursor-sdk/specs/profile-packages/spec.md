## Purpose

Declares which Pi npm packages ship with this profile by default, that a default install actually downloads the current Cursor SDK provider, and that a missing download must not block ordinary 1C work.

## ADDED Requirements

### Requirement: Default packages list the unpinned Cursor SDK provider

Shipped `settings.json` MUST include `npm:pi-cursor-sdk` in `packages`. The entry MUST NOT carry a version suffix (`@x.y.z`). The source project for that package is https://github.com/fitchmultz/pi-cursor-sdk. The list MUST still include the documented `<path-to-pi-1c-agent>` placeholder and MUST NOT contain a machine-local path.

#### Scenario: Fresh clone lists the plugin without a pin

- **WHEN** a user opens the shipped `settings.json` after cloning this profile
- **THEN** `packages` contains the exact string `npm:pi-cursor-sdk`
- **AND** it does not contain `npm:pi-cursor-sdk@` followed by a version
- **AND** it still contains `<path-to-pi-1c-agent>`

#### Scenario: Git documents the GitHub project

- **WHEN** a user reads the profile README deploy section
- **THEN** it names https://github.com/fitchmultz/pi-cursor-sdk as the Cursor provider source
- **AND** it tells them to install via `pi install npm:pi-cursor-sdk`

### Requirement: Default install downloads the latest published plugin

A documented default install of this profile MUST run `pi install npm:pi-cursor-sdk` (with `PI_CODING_AGENT_DIR` pointing at the clone) so Pi fetches the latest version published to npm at that moment. The git tree MUST NOT vendor `node_modules` or a packed tarball of the plugin. A later documented refresh MUST use the same unpinned command so a newer npm release is downloaded without editing `settings.json`.

#### Scenario: First install fetches current npm latest

- **WHEN** an operator follows the README deploy steps on a machine with network access
- **THEN** `pi install npm:pi-cursor-sdk` runs against the new profile
- **AND** the installed package version is whatever npm currently publishes as latest, not a version hardcoded in this git tree

#### Scenario: Refresh without editing settings

- **WHEN** an already-installed profile still has unpinned `npm:pi-cursor-sdk` in `packages` and the operator runs `pi install npm:pi-cursor-sdk` again
- **THEN** Pi downloads the then-current npm latest
- **AND** `settings.json` in git does not need a version bump for that refresh

#### Scenario: GitHub HEAD is not the default install source

- **WHEN** a default install runs
- **THEN** it uses the npm specifier `npm:pi-cursor-sdk`, not `pi install https://github.com/fitchmultz/pi-cursor-sdk`
- **AND** README MAY mention the GitHub URL as an equivalent for maintainers, but MUST NOT make git HEAD the default path

### Requirement: Failed or skipped download does not block DeepSeek 1C work

Install MUST NOT require a Cursor API key, MUST NOT change `defaultProvider` / `defaultModel` away from the shipped DeepSeek defaults, and MUST NOT fail the whole profile setup solely because npm is unreachable. `/doctor` MUST WARN (not FAIL CORE) when the specifier is missing, still pinned, or the package is not present on disk. Ordinary 1C work with the default DeepSeek model MUST remain possible.

#### Scenario: Offline clone still starts for 1C

- **WHEN** a user clones the profile and cannot reach the npm registry
- **THEN** `settings.json` still lists `npm:pi-cursor-sdk`
- **AND** `/doctor` reports WARN that the Cursor provider is not installed
- **AND** CORE can still pass if other CORE checks pass
- **AND** the default model remains DeepSeek

#### Scenario: Plugin listed but no Cursor key

- **WHEN** `pi-cursor-sdk` is installed and `auth.json` has no Cursor credential
- **THEN** `/doctor` does not FAIL CORE for the missing key
- **AND** Cursor models stay unused until the user runs `/login` for Cursor

#### Scenario: Pin leftover is a doctor warning

- **WHEN** shipped `settings.json` still contains `npm:pi-cursor-sdk@0.3.6` or any other `@version` suffix
- **THEN** `/doctor` WARNs that the Cursor provider is pinned and will not pick up newer releases

### Requirement: Contract tests lock the default specifier

The deterministic profile test suite MUST assert that shipped `settings.json` contains unpinned `npm:pi-cursor-sdk` and does not contain a version-suffixed `npm:pi-cursor-sdk@…` entry. The default suite MUST NOT call npm or `pi install`.

#### Scenario: Re-pin turns the suite red

- **WHEN** a future edit restores `npm:pi-cursor-sdk@0.3.6` (or another pin) in `settings.json`
- **THEN** at least one contract test fails and names `settings.json`

#### Scenario: Dropping the plugin turns the suite red

- **WHEN** a future edit removes `npm:pi-cursor-sdk` from `packages`
- **THEN** at least one contract test fails
