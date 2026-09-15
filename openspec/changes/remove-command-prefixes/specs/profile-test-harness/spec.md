## Purpose

Contract tests forbid `/1c-*` prompt files.

## MODIFIED Requirements

### Requirement: Unit tests cover the profile-inspection helpers

Behavior that can be reduced to a pure function (parsing a command title, classifying a `/commands` catalog section, inspecting `mcp.json` for unsolicited servers, scanning text for machine-local paths, detecting a JSON `## Upstream Handoff` block, reading skill front-matter) MUST be implemented as a testable helper and covered by unit tests using synthetic inputs (both the passing and the violating case). Alias-stub detection MUST NOT remain a required helper.

#### Scenario: Helper is proven on both good and bad input

- **WHEN** a unit test exercises a profile-inspection helper
- **THEN** it asserts the correct result for a compliant input and for a deliberately non-compliant input

### Requirement: Regression tests lock the existing доработки against the real files

The suite MUST include regression/contract tests that run against the actual shipped profile files and assert each already-implemented доработка from the current profile, at minimum: default `mcp.json` registers no memory/knowledge/1C-bundle (8002–8008) servers; no `/help`, `/plan`, `/build`, `/debug` prompt files exist; prompt titles use canonical unprefixed names (`/installmcp`, not `/1c-installmcp`); **no** `prompts/1c-*.md` files exist; `/commands` and `/review-airules` prompts exist and `/review-airules` is classified maintainer; destructive infobase prompts (`update1cbase`, `restore-testbase`, `deploy-and-test`, `build-release`) require target confirmation; writer/pipeline agents require a JSON `## Upstream Handoff`; the shipped `CAVEMAN` default is `auto`; `NOTICE` exists and separates upstream from overlay; no shipped file contains a foreign machine-local path; `settings.json` uses the `<path-to-pi-1c-agent>` placeholder, not a real machine path; `upstream.lock.json` carries the seeded pin; lab extras (`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru`) are present as skills and Vanessa MCP stays in `mcp.optional/`, not default `mcp.json`.

#### Scenario: A reverted доработка turns the suite red

- **WHEN** a future edit reintroduces a violation (for example adds `memory` to default `mcp.json`, adds `prompts/1c-installmcp.md`, or drops `NOTICE`)
- **THEN** at least one regression test fails and names the offending file and invariant
