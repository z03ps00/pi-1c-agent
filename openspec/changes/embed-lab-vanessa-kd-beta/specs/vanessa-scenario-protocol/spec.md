## Purpose

Defines how the Pi 1C agent authors, checks, and runs Vanessa Automation Gherkin scenarios through Vanessa MCP, as an opt-in extra that does not replace browser web-client tests.

## ADDED Requirements

### Requirement: Vanessa skill is the scenario contract

The profile MUST ship a `vanessa-mcp` skill whose description triggers on Vanessa Automation, `.feature` / Gherkin / Turbo Gherkin, the 1C test client (клиент тестирования), and Vanessa MCP. When that skill applies, the agent MUST follow its protocol and MUST NOT invent Gherkin steps from model memory.

#### Scenario: User asks for a Vanessa scenario

- **WHEN** the user asks to write or run a Vanessa `.feature` scenario
- **THEN** the agent loads `vanessa-mcp` and searches the Vanessa step library before writing any step text

#### Scenario: Ordinary BSL work does not load Vanessa

- **WHEN** the user asks only to edit a catalog manager module with no UI-scenario request
- **THEN** the agent does not run the Vanessa write/run loop

### Requirement: Vanessa MCP is opt-in

Default profile `mcp.json` MUST NOT register a Vanessa Automation MCP server. An optional fragment MUST exist so the user can add it after consent (`/installtools` or a standalone settings command, or `/init` Vanessa=yes plus an explicit MCP URL). `recommended` in `/installtools` MUST NOT preselect Vanessa MCP. `/checkmcp` MUST list Vanessa as `not configured` when the fragment is absent, not as a failure.

#### Scenario: Fresh profile has no Vanessa MCP

- **WHEN** a user deploys the default profile and does not opt into Vanessa
- **THEN** `mcp.json` has no Vanessa Automation URL and startup does not fail on that server

#### Scenario: User opts in with a URL

- **WHEN** the user confirms Vanessa MCP and supplies a reachable URL (or a `.dev.env` key the fragment substitutes)
- **THEN** only that Vanessa server is added; Cognee, OpenViking, and the 1C bundle remain unchanged

### Requirement: Preflight forbids fake Vanessa calls

Before scenario work the agent MUST confirm Vanessa MCP tools are actually exposed in the session. If they are not, the agent MUST tell the user to keep Vanessa «Управление MCP» running and reload MCP, and MUST NOT pretend a tool was called or claim a `run_scenario` result. The agent MUST read the URL/port from the active MCP config or project `.dev.env` and MUST NOT hardcode a lab port.

#### Scenario: MCP not exposed

- **WHEN** the user asks to run a scenario and Vanessa tools are missing from the session schema
- **THEN** the agent reports the blocker once and does not invent a Success result

#### Scenario: Port comes from config

- **WHEN** the project MCP entry or `.dev.env` has a Vanessa URL
- **THEN** the agent uses that URL and does not require a path that exists only on one developer PC

### Requirement: State and test client before UI actions

The agent MUST call the live Vanessa state tool (baseline `get_vanessa_automation_state`; live session name wins) before UI actions. If the test client is not connected, the agent MUST list profiles and connect with `manage_test_client` `action=connect` using a profile name from that list. The agent MUST NOT assume a tool named `connect_test_client`.

#### Scenario: Client already connected

- **WHEN** state shows the test client is connected
- **THEN** the agent does not reconnect unless an error requires it

#### Scenario: Client disconnected

- **WHEN** state shows the test client is not connected and a profile list is available
- **THEN** the agent connects with `manage_test_client` and the listed profile name

### Requirement: Library steps, syntax gate, then run

The agent MUST find each Gherkin step via the Vanessa library (`search_for_steps_by_keywords` or `frequently_used_steps`, live names winning). After writing or editing a `.feature`, the agent MUST open the file and run `check_syntax`. A file with unknown steps MUST NOT be sent to `run_scenario`. After a run the agent MUST read `get_test_results`. The agent MUST NOT claim success unless the run returned Success, or MUST record an explicit blocker.

#### Scenario: Unknown step is not executed

- **WHEN** `check_syntax` reports an unknown step
- **THEN** the agent replaces it with a library step and re-checks; it does not call `run_scenario` on that file yet

#### Scenario: Failed run is reported as failed

- **WHEN** `run_scenario` does not return Success
- **THEN** the reply states the failure or blocker and does not claim a verified pass

### Requirement: Inner window titles and feature location

Window assertions MUST use the inner 1C window title from the test client, not the OS application caption. New and edited scenarios MUST live under `tests/features/`. The Vanessa skill MUST NOT mutate BSL, metadata XML, EPF, or CFE as part of scenario authoring.

#### Scenario: OS caption is rejected as an assertion

- **WHEN** the OS window title is `Демо-база / Управление торговлей, редакция 11` and the inner window is `Заказы клиентов`
- **THEN** the scenario asserts `Заказы клиентов`, not the OS caption

#### Scenario: Feature is not written under src

- **WHEN** the agent creates a new Vanessa scenario
- **THEN** the file is under `tests/features/` and not under `src/` or `_docs/`

### Requirement: Vanessa MCP is a different class than data MCP

For Vanessa UI scenarios the agent MUST use Vanessa Automation MCP only. `1c-data-mcp` and Kharin `1c_mcp` MUST NOT be used to drive the test client. The purchased 1C docs/syntax/code-check bundle MUST NOT be treated as a substitute for Vanessa MCP.

#### Scenario: Data MCP is present but Vanessa is not

- **WHEN** `1c-data-mcp` tools are exposed and Vanessa MCP is not
- **THEN** the agent reports that Vanessa UI scenarios cannot run, and does not drive the test client through `vcexecutecode`

### Requirement: Browser UI testing stays a separate path

Web-client tests gated by `UI_TESTING` and `INFOBASE_PUBLISH_URL` MUST remain on the existing browser/`1c-tester` path. A Vanessa scenario request MUST NOT be executed as a Playwright / agent-browser session against the web publish URL unless the user explicitly asked for web-client browser testing instead of Vanessa.

#### Scenario: User asks for a .feature run

- **WHEN** the user asks to run a Vanessa `.feature`
- **THEN** the agent uses Vanessa MCP, not `/deploy-and-test` Step 4 browser tools

#### Scenario: User asks for web UI tests with UI_TESTING=off

- **WHEN** the user asks only for web-client UI tests and `UI_TESTING=off`
- **THEN** the existing skip behavior still applies; Vanessa is not started as a silent substitute

### Requirement: Init extra for Vanessa is project data only

`/init` MUST ask whether the project wants Vanessa scenario tests. Silence MUST NOT be treated as Yes. On Yes and Apply, the project MUST receive `tests/features/` (and the documented companion dirs) plus `.dev.env` keys for the Vanessa MCP URL if the user supplied one. Binaries (Vanessa EPF, VAExtension, `client_mcp.cfe`) MUST NOT be downloaded unless the user explicitly confirmed that extra in this run.

#### Scenario: User declines Vanessa

- **WHEN** the user answers No / 0 to the Vanessa extra
- **THEN** Apply does not create `tests/` or Vanessa `tools/` dirs and does not add a Vanessa MCP server

#### Scenario: User accepts Vanessa

- **WHEN** the user answers Yes and Apply runs
- **THEN** `tests/features/` exists in the project and the profile skill is used; skills are not copied into the project

#### Scenario: Vanessa enabled later

- **WHEN** the project declined Vanessa at init and later the user consents to enable it
- **THEN** the agent creates the Vanessa project dirs and optional MCP URL without re-running the rest of `/init`
