## Purpose

Defines how optional MCP servers are chosen, installed, checked, and disabled, and how the agent uses Docker when it is available instead of banning it as a product rule.

## ADDED Requirements

### Requirement: Memory, knowledge, and the 1C bundle are opt-in

Default profile `mcp.json` MUST NOT register Cognee (`memory` / `cognee-memory`), OpenViking (`knowledge`), or 1C bundle servers (`127.0.0.1:8002`–`8008` or equivalents) until the user has explicitly opted in through `/installtools` or a standalone installer. A fresh profile clone MUST start without those entries and MUST NOT emit startup connect failures for them.

#### Scenario: Fresh profile has no optional servers

- **WHEN** a user deploys the default profile without choosing memory or the 1C bundle
- **THEN** `mcp.json` contains neither `memory`/`knowledge`/`cognee-memory` nor the 1C syntax/docs/templates/code-check/ssl servers

#### Scenario: Opt-in adds one family

- **WHEN** the user confirms OpenViking and supplies a reachable URL
- **THEN** only the `knowledge` server is added and Cognee and the 1C bundle remain absent until separately chosen

### Requirement: Install menu asks before any MCP install

`/installtools` MUST remain the only guided installer menu. It MUST ask, before installing anything: whether the purchased 1C MCP bundle should be installed; whether Cognee should be used; whether OpenViking should be used; then the remaining optional tools. Reply `recommended` MUST NOT preselect Cognee or OpenViking. Reply `all` MUST still confirm Cognee and OpenViking individually. The menu MUST NOT silently install any tool.

#### Scenario: Recommended skips memory providers

- **WHEN** the user answers `recommended` and has not asked for agent memory
- **THEN** Cognee and OpenViking are not installed and are not written into `mcp.json`

#### Scenario: Bundle purchase question is first

- **WHEN** the 1C MCP bundle is not installed
- **THEN** the agent asks whether the user purchased the bundle and wants it installed before any docker command is run or printed

### Requirement: Standalone installers exist per optional server family

The profile MUST provide standalone commands:

- `/installmcp` — purchased 1C Docker bundle (first install)
- `/install-cognee` — Cognee
- `/install-openviking` — OpenViking
- `/install-edt-mcp`, `/install-agent-browser`, `/install-windows-mcp` — optional extras

Each standalone installer MUST ask for consent. After consent, if Docker is usable, the agent MAY run the documented `docker`/`compose` steps (with a second confirm before `docker run`). If Docker is not usable, the agent MUST print copy-paste commands for the host and MUST NOT loop. Uninstall or disable MUST be possible by removing that `mcp.json` entry without affecting other servers.

#### Scenario: OpenViking installer is callable

- **WHEN** the user runs `/install-openviking`
- **THEN** the agent explains what OpenViking is, asks whether to use it, and if yes either runs the install via Docker after confirm or prints host commands when Docker is unavailable

#### Scenario: Disable one provider

- **WHEN** the user asks to stop using Cognee
- **THEN** the Cognee entry is removed from `mcp.json` and OpenViking, if enabled, stays

### Requirement: Docker is a product capability, not a global ban

The shipped profile MUST allow the agent to use `docker` / `podman` for MCP install, update, start, and health when the runtime can talk to a Docker engine (CLI + socket). Destructive or creating steps MUST be confirmed. The AWG “never docker / only `~/mcp-ctl.sh`” rule MUST NOT be the product default in `AGENTS.md` or in a hard-block that always fires.

When Docker is unavailable (no socket, permission denied, isolated namespace), the agent MUST detect that once, tell the user, and fall back to host-side commands for that session. Lab-only hard-block, if kept, MUST be opt-in (`PI_1C_BLOCK_DOCKER`) or auto-detect, not unconditional.

Host helpers such as `~/mcp-ctl.sh` / `~/mcp-host.sh` MAY be documented as **this lab’s** path. They MUST NOT be the only documented mutate path for Windows Docker Desktop users.

#### Scenario: Docker Desktop user installs the bundle

- **WHEN** the user confirms `/installmcp` on a machine where `docker ps` works
- **THEN** the agent may run the documented docker steps after confirmation and MUST NOT refuse with an AWG kill-switch message

#### Scenario: Isolated lab without a socket

- **WHEN** `docker ps` fails because the socket is missing or the engine is unreachable
- **THEN** the agent reports that Docker is unavailable here, prints host commands, and does not retry docker in a loop

### Requirement: Check is status-only by default

`/checkmcp` MUST probe only servers the user opted into (plus any actually present in `mcp.json`). Default invocation MUST NOT install or start anything. A separate explicit repair path (`/checkmcp repair` or equivalent) MAY start/install via Docker when Docker works; otherwise it prints host commands. Optional catalog members that are not in `mcp.json` MUST be reported as `not configured`, not as failures.

#### Scenario: Status of a down opted-in server

- **WHEN** OpenViking is opted in and unreachable
- **THEN** `/checkmcp` reports it down once and offers repair without starting containers unless the user asked for repair

#### Scenario: Unconfigured graph MCP is not a failure

- **WHEN** `1c-graph-metadata-mcp` is not in `mcp.json`
- **THEN** `/checkmcp` lists it as not configured and the overall check can still pass for the configured set

### Requirement: Startup does not spam optional MCP errors

If an opted-in server URL is unset or the server is down, the client MUST fail that server quietly or omit it. Skills that recall Cognee/OpenViking MUST report unavailability once per task and continue with project files. They MUST NOT retry the missing server in a loop.

#### Scenario: Missing Cognee at task start

- **WHEN** a meaningful task starts and Cognee is not configured
- **THEN** context bootstrap notes “memory MCP not in use” once and proceeds without calling `recall`

### Requirement: Installers do not persist secrets in project memory files

Tilda login, license keys, IB passwords, and `KNOWLEDGE_MCP_AUTHORIZATION` MUST NOT be written to `memory.md`, Cognee, OpenViking, AGENTS, or handoffs. Chat MUST not echo them back. Store them only in local secret files the user already uses (`.dev.env`, `auth.json`, installer `config.env` outside git) after stating where they go.

#### Scenario: Tilda password is not saved to memory.md

- **WHEN** `/installmcp` needs a store login
- **THEN** the password is not appended to `memory.md` and is not stored via `remember`

### Requirement: Live data MCP is not a product default

Anonymous `/hs/mcp` with `Выполнить()` (`1c-data-mcp`) MUST NOT be enabled by default. If offered, the agent MUST warn that it is unauthenticated code execution on the infobase and MUST require an explicit test-IB confirmation.

#### Scenario: Data MCP is not auto-selected

- **WHEN** the user answers `recommended` in `/installtools`
- **THEN** `1c-data-mcp` is not published and not added to `mcp.json`
