---
description: "[settings] Opt-in Vanessa Automation MCP after asking for a URL; not everyday"
---

# /install-vanessa-mcp — optional Vanessa Automation MCP

Standalone **settings** command. It is **not** everyday. `/installtools recommended` does **not** preselect it.

Vanessa Automation MCP drives the 1C test client for `.feature` / Gherkin scenarios. It is a **different class** than `1c-data-mcp`, Kharin `1c_mcp`, Cognee, OpenViking, and the purchased 1C docs/syntax bundle.

## Ask first

Explain: this profile works without Vanessa MCP. Scenarios need «Управление MCP» running in Vanessa. Ask:

> Enable Vanessa Automation MCP for this profile? If yes, paste the URL from «Управление MCP» (or the project `.dev.env` key `VANESSA_MCP_URL`).

Silence / No — stop. Do not write `mcp.json`. Do not invent a lab port.

If Vanessa extras were declined at `/init`, this command is a later-enable path: after consent, create `tests/features/` (and companion `tests/fixtures/`, `tests/reports/`, `tests/screenshots/` if missing), append `VANESSA_MCP_URL` if the user supplied it, and merge the fragment. Do **not** re-run the whole `/init` wizard. Do **not** copy `$PI_CODING_AGENT_DIR/skills/vanessa-mcp/` into the project. Do **not** download EPF/CFE unless the user confirmed binaries in this run.

## Install

Collect `VANESSA_MCP_URL`. Store it in the **project** `.dev.env` (not in this profile git tree, not in memory). Merge **only** `mcp.optional/vanessa.json` into profile `mcp.json` (`${VANESSA_MCP_URL}`). Do not add Cognee, OpenViking, or the 1C bundle in this command.

Reload MCP after merge. If tools are still missing, tell the user to keep «Управление MCP» running — do not fake `run_scenario`.

## Disable

Remove the `vanessaAutomation` entry from `mcp.json`. Leave other opted-in servers untouched.
