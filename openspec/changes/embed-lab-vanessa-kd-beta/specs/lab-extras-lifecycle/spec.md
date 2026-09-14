## Purpose

Keeps author-owned and separately pinned extras (Vanessa, Конвертация данных, MCP Toolkit, Humanizer RU) in the Pi 1C profile without mixing them into `comol/ai_rules_1c` sync, and without copying the agent into each 1C project.

## ADDED Requirements

### Requirement: Lab extras are not ai_rules_1c

The profile MUST treat `vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, and `humanizer-ru` as extras outside `comol/ai_rules_1c`. `/review-airules` MUST NOT copy, pin, or overwrite those trees. `UPSTREAM-REGISTER.md` and `upstream.lock.json` MUST remain `ai_rules_1c`-only. A maintainer MUST be able to refresh `ai_rules_1c` without changing extras, and refresh extras without touching the `ai_rules_1c` pin. Humanizer RU MAY cite Comol’s separate `Humanizer_RU` repository in the extras lockfile; that MUST NOT become an `ai_rules_1c` pin.

#### Scenario: Comol airules review leaves extras untouched

- **WHEN** a maintainer runs `/review-airules` against the pinned `comol/ai_rules_1c`
- **THEN** the report does not list extra skills as upstream files to install, and those skill directories are not modified in that review

#### Scenario: Extra refresh does not move the airules pin

- **WHEN** a maintainer refreshes the Vanessa, KD, toolkit, or Humanizer RU skills into the profile
- **THEN** `upstream.lock.json` `lastAppliedSha` is unchanged and no new `ai_rules_1c` section is required in `UPSTREAM-REGISTER.md`

### Requirement: Each extra skill is marked as an extra snapshot

Every shipped extra skill MUST declare that it is a snapshot that may change or grow, visible in the skill frontmatter or the skill body first screen, and in the lab extras register. Vanessa/KD/toolkit MUST be labeled lab beta extras, not a finished `ai_rules_1c` product. Humanizer RU MUST be labeled as a `Humanizer_RU` snapshot plus author `knowledge/` overlay, not as `ai_rules_1c`.

#### Scenario: Vanessa or KD skill file states beta

- **WHEN** a user or agent opens `skills/vanessa-mcp/SKILL.md` or a KD extra `SKILL.md`
- **THEN** the file states it is a lab beta extra and may be updated independently of `ai_rules_1c`

#### Scenario: Humanizer skill states its source

- **WHEN** a user or agent opens `skills/humanizer-ru/SKILL.md`
- **THEN** the file states it is Humanizer RU (not the English `humanizer`) and is outside `ai_rules_1c` sync

#### Scenario: Register records a snapshot version

- **WHEN** the extras are first copied into the profile
- **THEN** the lab extras register records a date, source path or identifier, and extra/beta status for each skill tree including `humanizer-ru`

### Requirement: Skills live in the global profile

Extra skills MUST ship under `$PI_CODING_AGENT_DIR/skills/`. Project initialization MUST NOT copy those skill trees into the 1C project (no `.cursor/skills`, `.opencode/skills`, or `.pi/skills` copies of Vanessa/KD/toolkit/humanizer-ru as part of `/init` Apply). A 1C project MAY receive only data: directories, `.dev.env` keys, optional local binaries under `tools/`, and a Humanizer preference flag.

#### Scenario: Init Apply does not vendor skills into the project

- **WHEN** the user answers Yes to Vanessa, KD, or Humanizer extras during `/init` Apply
- **THEN** the project does not gain a project-local copy of the skill trees

#### Scenario: Agent loads extras from the profile

- **WHEN** Pi or Cursor uses this profile as `PI_CODING_AGENT_DIR`
- **THEN** the Vanessa, KD, toolkit, and Humanizer RU skills are available from the profile `skills/` directory without a per-project skill install

### Requirement: Declined extras can be enabled later

`/init` MUST ask Vanessa, KD, and Humanizer RU extras. Silence MUST NOT be Yes. A declined extra MUST leave the 1C project without that extra’s dirs, binaries, MCP fragment, or auto-use flag. The profile MUST provide a later-enable path that does not re-run full project initialization (settings command, extras re-ask, or first-use consent when the user later asks for that extra). Skills remain in the global profile either way.

#### Scenario: User declines everything at init

- **WHEN** the user answers No / none to Vanessa, KD, and Humanizer RU
- **THEN** Apply does not create `tests/`, Vanessa `tools/`, or `tools/mcp-toolkit`, does not add Vanessa MCP, and does not turn on Humanizer auto-use for that project

#### Scenario: User enables Vanessa later

- **WHEN** a project that declined Vanessa later asks to enable Vanessa extras
- **THEN** the agent asks consent, writes only that extra’s project data, and does not re-run the whole `/init` wizard

#### Scenario: Explicit «очеловечь» still works after decline

- **WHEN** Humanizer RU was declined at init and the user later says «очеловечь» on a Russian text
- **THEN** the agent loads profile `humanizer-ru` for that request and does not copy the skill into the project

### Requirement: Lab extras have a dedicated refresh path

The profile MUST document a refresh procedure that copies an updated snapshot from the author’s working tree into `$PI_CODING_AGENT_DIR/skills/` and appends the lab extras register. That procedure MUST NOT run upstream `install.ps1`, MUST NOT call `/review-airules`, and MUST NOT require an `ai_rules_1c` SHA. Cursor `~/.cursor/skills` MAY remain the author’s working tree during beta; the profile copy is what Pi ships.

#### Scenario: Later extra update is a profile copy

- **WHEN** the author changes the Cursor Vanessa, KD, or Humanizer RU skill and asks to refresh the Pi profile
- **THEN** the agent copies the updated tree into profile `skills/` and records the refresh in the lab extras register without changing `ai_rules_1c` files

#### Scenario: Refresh is explicit

- **WHEN** nobody asked to refresh extras
- **THEN** the agent does not overwrite profile extra skills as a side effect of `/updaterules`, `/checkupdates`, or `/review-airules`

### Requirement: Doctor distinguishes extras from CORE airules trees

`/doctor` MUST confirm the five extra skill trees exist when this change is applied, and MUST treat a missing extra as WARN (profile still usable for ordinary 1C coding) unless the user opted a project into that extra and the skill is absent. `/doctor` MUST FAIL CORE if a shipped extra skill contains a required machine-local path (`/home/<user>/`, `/mnt/vol_*`, `C:/Users/<someone>` as a required path).

#### Scenario: Fresh clone without extras used yet

- **WHEN** `/doctor` runs on a profile that has the extra skills but no project has opted into Vanessa, KD, or Humanizer auto-use
- **THEN** CORE can still pass; missing optional MCP for Vanessa is `not configured`, not FAIL

#### Scenario: Extra skill hardcodes a lab volume

- **WHEN** a shipped extra `SKILL.md` requires `/mnt/vol_328/...` or `/home/pavel/...` as the only working path
- **THEN** `/doctor` reports CORE fail with that file path

### Requirement: Attribution is honest

NOTICE, README, and the extras register MUST state that Vanessa/KD/toolkit are this profile’s author lab rules (beta), adapted in part from third-party MIT skill text and third-party EPF/MCP products, and are **not** `ai_rules_1c`. They MUST state that `humanizer-ru` is a snapshot of Comol `Humanizer_RU` plus this author’s `knowledge/` overlay, and is **not** the English `humanizer` skill. Third-party product names (Vanessa Automation, MCP Toolkit, neurofish client MCP, Humanizer_RU) MAY be cited as runtime or skill dependencies.

#### Scenario: README names the owner and Humanizer_RU

- **WHEN** a new user reads the profile README extras section
- **THEN** they can tell lab Vanessa/KD skills are author beta extras, and Humanizer RU is a separate Comol product snapshot, not `ai_rules_1c`
