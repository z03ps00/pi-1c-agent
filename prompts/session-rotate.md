---
description: "[settings] Opt-in Pi-only session rotation — on|off|status|<percent> (default off, threshold 85, range 50–95)"
---

# /session-rotate — opt-in session rotation instead of compaction

Toggle the Pi 1C alternative to in-place compaction: when context usage reaches a threshold, write a handoff, open a **new** session with a clean window, and continue from that handoff.

This command is **Pi-only**. Cursor has no context-usage or `newSession` hook. Under Cursor: report that session rotation does **not** activate, print the documented dual-host gap, and stop. Do not invent a rotation.

Canonical behaviour is implemented by the `pi-1c-agent` extension (`registerCommand("session-rotate")`). This prompt is the catalog/docs surface and the Cursor no-op procedure.

## Values

Parse the argument (case-insensitive, tolerate trailing punctuation). Unrecognised arguments are reported back, never guessed.

| Argument | Effect |
|---|---|
| `on` | Enable. Threshold stays as last set, or **85** if never set. |
| `off` | Disable. Revert to normal Pi in-place compaction. |
| `status` or empty | Report enabled/disabled and the effective threshold. Change nothing. |
| integer `50`–`95` | Set the threshold percent. Keep enabled/disabled unchanged. |
| `on <percent>` | Enable and set the threshold in one step. |

Default: **off**, threshold **85**. Valid range is an integer **50–95** inclusive. Out of range: reject, keep the previous threshold, explain the range.

The setting persists in Pi session state (`pi-1c-session-rotate-state`). It survives compaction, resume, and a rotation into a new session. It does **not** edit `settings.json` compaction defaults.

## What it does when enabled (Pi)

After a turn has settled (agent idle), if context usage percent ≥ threshold:

1. Ask the model to write a handoff via the `handoff` skill to `handoffs/handoff-<YYYYMMDD-HHMMSS>.md` (same format and location as `/handoff`).
2. If the file is missing, empty, or contains secrets / `.dev.env` / credentials, **abort** the rotation and leave in-place compaction available.
3. Otherwise start a new session (`parentSession` = previous file) and send a kickoff that names the handoff path and says: continue remaining work, do not repeat completed discovery.
4. Suppress the next **threshold** `session_before_compact` once for that rotation. **overflow** and **manual** `/compact` still run. Overflow during a turn is never cancelled; rotation waits until idle.

When disabled, behaviour is identical to today: Pi compaction plus the manual `handoff` skill.

## status

Report, without editing:

- enabled or disabled;
- effective threshold percent;
- host: Pi (runtime active) or Cursor (does not activate).

## Constraints

- Do not name this command `/new`, `/compact`, `/mode`, `/help`, `/plan`, `/debug`.
- Do not copy secrets, tokens, passwords, `.dev.env`, or infobase connection strings into the handoff.
- Do not change `settings.json` `compaction.enabled`.
