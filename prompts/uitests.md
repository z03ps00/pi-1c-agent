---
description: Explicitly set, disable or inspect UI testing and the test-client window independently of verification depth and orchestration
userOnly: true
---

# /uitests — explicit UI-test policy

Control `UI_TESTING` and `MCP_QA_CLIENT_VISIBLE` in `.dev.env`. Read `rules-1c/rules/dev-standards-env.md → UI_TESTING — UI-testing mode` and `→ MCP_QA_CLIENT_VISIBLE — test client window`; they own execution prerequisites. This command configures policy, not a test run, deployment or installation.

## Arguments

Trim whitespace and compare case-insensitively:

- `essential` → `UI_TESTING=essential`: after the change reaches the dev/test infobase, check only the important new or changed user-visible behaviour automatically; this is the default for a missing or empty setting.
- `on` or `auto` → `UI_TESTING=auto`: run every applicable UI scenario automatically during verification when the authorized dev/test environment and a test route are ready.
- `manual` → `UI_TESTING=manual`: run only on an explicit UI-test request; an invalid setting also acts as `manual`.
- `off` → `UI_TESTING=off`: do not run UI tests on any route.
- `visible` → `MCP_QA_CLIENT_VISIBLE=true`: a test client the agent starts for QA MCP runs on the person's desktop (default).
- `hidden` → `MCP_QA_CLIENT_VISIBLE=false`: it runs on a hidden desktop; on an error or a request to show it becomes visible (`rules-1c/rules/qa-testclient.md`).
- Empty or `status` → report the effective state; change nothing.
- Any other argument → list accepted values; change nothing.

## Apply

1. Read the current settings and any explicit session override. Edit only the key the argument names in an existing `.dev.env`, replacing its line or appending a missing key; preserve all other content. If the file is absent, apply a session-only override and point to `install.ps1 init` for persistent project setup; do not create a partial file or start installation.
2. Apply the selected value immediately, replacing any earlier override of the same key in this session. No re-render or client restart is needed for a value change; a window change applies to the next test-client launch. The command definition itself must first be installed by the normal rules update flow.
3. Confirm in Russian: effective value, project-persistent or session-only scope, and what triggers a run. For `essential` / `auto`, report any known missing prerequisite without starting a setup questionnaire or claiming readiness.

## Status and boundaries

Status reports the effective `UI_TESTING` and window values and their source (session override, project setting or default), the available routes — QA MCP (`1c-qa` tools exposed, `TOOL_QA`) and the web client (publication URL, `TOOL_AGENT_BROWSER` / `TOOL_BROWSER`) — and any already-known environment/tool blocker. Do not connect to an infobase, start a test client or open a browser just to display policy.

An explicit natural-language enable/disable request follows this command; mere discussion or quoted examples do not switch policy. A request to run tests once under `manual` does not change the persistent value. Under `off`, a test-run request alone does not enable UI; point to `/uitests essential`, `/uitests on` or `/uitests manual`. An explicit instruction to both enable and run needs no second toggle confirmation, but execution prerequisites still apply.

UI policy is independent of Mode, verification depth and orchestration. `/sdlc` and `/litemode` preserve it. `off` disables only UI execution: the agent must still perform applicable static checks, review and other allowed behavioural verification. It is not a passing UI result or a blanket DoD waiver; criteria that require UI evidence stay unverified unless explicitly waived in scope. Canon: `rules-1c/rules/verification-delivery.md → Soft gate D — UI confirmation policy`.
