## Purpose

Defines the runtime contract that keeps the worker from fighting itself: one process doc, one handoff, portable paths, MCP-first search that matches the actual server set, lab-vs-product Docker, honest dual-host limits, a doctor that reports product health, and a full agent test after apply.

## ADDED Requirements

### Requirement: Child agents cite documents that exist

Subagent prompts MUST cite files that exist in this profile: the Pi overlay `AGENTS.md` plus `rules-1c/AGENTS-UPSTREAM.md` and `rules-1c/core/*`. They MUST NOT instruct the child to follow MCP Tool Calling / Development Procedure sections of a root `AGENTS.md` that this overlay does not contain.

#### Scenario: Explorer can open its process doc

- **WHEN** `1c-explorer` is asked to follow its procedure
- **THEN** every path it names exists in the profile tree

### Requirement: One handoff block

Writer and pipeline stages that use Pi `subagent_1c` MUST emit a single `## Upstream Handoff` fenced JSON object with keys `task`, `artifacts`, `findings`, `public_surface`, `locked_decisions`, `constraints`, `unresolved`, `verification`. Markdown `## Handoff for the next subagent` MUST NOT be required. If a human-readable inventory is needed, it MUST live inside those JSON arrays.

#### Scenario: Valid JSON handoff is accepted

- **WHEN** a developer subagent finishes a stage with a well-formed `## Upstream Handoff` JSON block
- **THEN** the next stage can start without a second markdown handoff block

#### Scenario: Markdown-only handoff is not the contract

- **WHEN** a writer emits only `## Handoff for the next subagent`
- **THEN** Pi validation treats the stage as incomplete

### Requirement: MCP-first search matches configured servers

`mcp-1c-tools` and explorer/developer search chains MUST start from servers actually present in the active `mcp.json`. Missing graph or code-metadata servers MUST degrade in one sentence to the next available index or to native Grep/Read. The chain MUST NOT loop on absent tool names.

#### Scenario: No graph MCP

- **WHEN** the session has docs, ssl, and syntax MCP but not graph-metadata
- **THEN** search starts at the first configured index and records that graph MCP is not configured

### Requirement: Shipped profile is cross-platform and has no foreign machine folders

The agent MUST run from this profile on Windows, Linux, and macOS without assuming folders that exist only on one developer PC. Shipped files (prompts, rules, skills, agents, `AGENTS.md`, `README.md`, `settings.json`, default `mcp.json`) MUST NOT contain absolute paths of a specific machine. `C:/DevopsMoments` is one known leftover from another PC; the same rule applies to any similar binding (`D:\1С_Базы`, `/home/<someone>/…`, `/mnt/vol_328/…`, a profile directory with a trailing space used as a required path).

Allowed instead: relative paths inside the profile or project, `$PI_CODING_AGENT_DIR`, `$HOME` / `%USERPROFILE%` only as *examples* in `.example` files, and 1C infobase paths that live in each project’s local `.dev.env` (never copied into the profile git). `/doctor` MUST fail CORE if a managed shipped file still contains `DevopsMoments`, another hardcoded user home, or a volume mount that is not an env placeholder.

Lab helpers such as `~/mcp-ctl.sh` MAY be documented as optional on *this* lab; they MUST NOT be required for the product to start on another PC.

#### Scenario: Clone on a clean PC has no DevopsMoments

- **WHEN** a user clones the profile onto a machine that has no `C:/DevopsMoments`
- **THEN** no shipped prompt, rule, or `settings.json` points at that folder, and `/doctor` CORE can pass

#### Scenario: Linux clone is not stuck on Windows-only roots

- **WHEN** the profile is used on Linux
- **THEN** instructions use `$PI_CODING_AGENT_DIR` or relative paths, not `C:\…` as the only layout

#### Scenario: Doctor catches any leftover machine path

- **WHEN** a managed prompt still contains `C:/DevopsMoments/pi-agents/config-1c` or `/home/pavel/.pi/packages/pi-1c-agent`
- **THEN** `/doctor` reports CORE fail with the file path

### Requirement: Overlay memory policy is conditional

The always-on `AGENTS.md` shared-context block MUST require Cognee/OpenViking recall only when those servers are opted in and connected. When they are off, the worker MUST treat project files as the only required context source and MUST NOT attempt mutating memory writes.

#### Scenario: Task without memory MCP

- **WHEN** a substantial task completes and Cognee is not opted in
- **THEN** the agent does not call `remember` and does not treat a failed write as a task failure

### Requirement: Product overlay does not globally forbid Docker

Shipped `AGENTS.md` MUST NOT tell the agent it must never run docker/podman. Docker policy follows `mcp-lifecycle`: allow when the engine is reachable, confirm creates, degrade when unreachable. A lab-specific AWG paragraph MAY exist only behind detect/opt-in, not as always-on product text.

#### Scenario: Product clone has no AWG docker ban

- **WHEN** a user installs the profile on Windows Docker Desktop without setting a lab docker-block flag
- **THEN** overlay instructions do not forbid docker and the 1c-mode tool_call hook does not hard-block `docker ps`

### Requirement: Doctor reports product health including MCP opt-in and command names

`/doctor` MUST report: profile CORE trees, command-name collisions, whether Cognee/OpenViking/1C bundle are opted in, whether configured MCP URLs respond, whether a lab docker-block is active vs product-allow, leftover **machine-local** paths (including `C:/DevopsMoments` and other absolute user/volume roots), and unsolicited servers in default `mcp.json`. A green CORE result MUST NOT be possible when default `mcp.json` still registers unsolicited memory, knowledge, or 1C bundle ports, or when shipped files still bind a foreign PC folder.

#### Scenario: Unsolicited memory fails doctor

- **WHEN** default `mcp.json` still lists `memory` and the user never opted in
- **THEN** `/doctor` fails that check and tells the user how to remove or opt in

### Requirement: Dual host is stated honestly

README and overlay MUST state that PLAN/BUILD tool gates exist in **Pi** (`1c-mode`). Cursor loads the same `AGENTS.md` text but does not enforce the PLAN write-block. `/init` TUI is Pi-only. The profile MUST NOT claim “the same gated agent in Cursor and Pi” unless a Cursor equivalent exists.

#### Scenario: Cursor user reads the limit

- **WHEN** a user opens the profile README
- **THEN** it says Cursor will not enforce Pi PLAN and `/init` is a Pi command

### Requirement: Caveman default is auto

Shipped default for `CAVEMAN` MUST be `auto` (terse on implementation, not on review/PRD/docs). Empty or invalid MUST NOT mean `on` for analysis and review.

#### Scenario: Review is not caveman by default

- **WHEN** `CAVEMAN` is unset on a fresh project
- **THEN** a code-review or PRD answer is not forced into caveman compression

### Requirement: Upstream license is explicit before product distribution

The profile MUST ship a LICENSE or NOTICE that states the `comol/ai_rules_1c` pin is used under the upstream terms (currently unspecified / “use as you like” on GitHub README) and that this overlay is separate. Redistributing a full vendored upstream snapshot MUST follow the package `UPSTREAM-LICENSE-NOTICE`. APPLY MUST NOT invent a license the user did not choose; it MUST add a NOTICE file pointing at upstream README plus overlay copyright.

#### Scenario: Clone contains a notice

- **WHEN** a user opens the profile root
- **THEN** a NOTICE or LICENSE file explains upstream vs overlay and does not leave license as an unmentioned gap

### Requirement: Apply is followed by a full agent test and a fix-retest loop until requirements pass

After the file changes of this productization are written, the implementing agent MUST run a complete verification pass covering every capability in this change (`command-surface`, `mcp-lifecycle`, `agent-runtime-contract`, `upstream-airules-sync`). The pass MUST be executed by the agent (commands, greps, `/doctor`, read-only `/review-airules`, Docker reachability check, machine-path scan), not only a human checklist. Each required scenario MUST be recorded as pass, fail, or skipped-with-reason. Destructive infobase loads, paid-bundle install, and Cognee/OpenViking install MUST be dry-run or inspected (prompt text + confirmations), not executed against a live production IB.

If any required scenario fails or a requirement in these specs is not met, the agent MUST **not** stop and call the work done. It MUST loop: (1) fix the failing files, (2) re-run the **full** test suite, (3) update `verification.md`, until every required row is pass. A skip is allowed only when the check cannot run on this host (example: no Docker socket) **and** the degrade path still satisfies the spec. APPLY MUST NOT be reported complete while any required scenario is fail, untested, or skipped without a spec-legal reason. “Good enough” with known fails is not complete.

The agent MUST write the report under `openspec/changes/productize-pi-1c-agent/verification.md` listing each check, outcome, and which loop iteration produced the final pass.

#### Scenario: Agent tests the catalog after apply

- **WHEN** implementation of command-surface files is finished
- **THEN** the agent runs `/commands` (or reads the prompt equivalent), confirms everyday vs maintainer, confirms `/review-airules` and `/doctor` exist, and records the result

#### Scenario: Agent tests MCP opt-in without installing

- **WHEN** default `mcp.json` has been rewritten
- **THEN** the agent verifies it has no unsolicited `memory`/`knowledge`/1C 8002–8008 entries, runs `/checkmcp` in status-only interpretation, and does not start containers unless the user asked for repair

#### Scenario: Agent tests Docker policy on this machine

- **WHEN** the overlay no longer globally forbids docker
- **THEN** the agent tries a non-mutating `docker ps` (or equivalent): if it works, the test is pass for allow; if it fails, the test is pass for degrade (one message, host commands, no loop)

#### Scenario: Incomplete test blocks done

- **WHEN** the agent has not exercised `/review-airules` read-only review or `/doctor`
- **THEN** the implementation is not reported complete

#### Scenario: Fail starts another fix-test cycle

- **WHEN** `/doctor` or the path scan fails because a shipped file still contains `C:/DevopsMoments`
- **THEN** the agent removes or replaces that path, re-runs the full verification suite, and only then may mark the path check pass

#### Scenario: Done only when the suite is green

- **WHEN** any required verification row is still fail
- **THEN** APPLY is not complete, even if most other rows passed
