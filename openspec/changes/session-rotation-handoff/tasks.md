## 1. Profile command surface (this repo)

- [x] 1.1 Add `prompts/session-rotate.md` (`/session-rotate`) documenting `on | off | status | <percent>`, default off, threshold default 85, range 50–95, Settings tier
- [x] 1.2 Add one-release alias stub `prompts/1c-session-rotate.md` that prints "alias of /session-rotate" once and points at the canonical command
- [x] 1.3 Add a `/session-rotate` row to `prompts/CATALOG.md` in the Settings section, next to `/caveman`
- [x] 1.4 Add a `README.md` note: session rotation is opt-in, Pi-only (dual-host gap), reuses the handoff format, does not change `settings.json` compaction defaults
- [x] 1.5 Note in `skills/handoff/SKILL.md` (or its usage) that session rotation reuses this handoff format and location

## 2. Extension state and command (pi-1c-agent follow-up)

- [x] 2.1 Persist `{ enabled, thresholdPercent }` via `pi.appendEntry("pi-1c-session-rotate-state", ...)`; restore on `session_start` (last entry wins), default `{ enabled:false, thresholdPercent:85 }`
- [x] 2.2 `registerCommand("session-rotate")` handling `on`, `off`, `status`, and an integer percent; register `/1c-session-rotate` alias
- [x] 2.3 Validate threshold as integer 50–95; reject out-of-range, keep previous value, explain range
- [x] 2.4 Show enabled/threshold in the footer status (mirror the `caveman`/`1c-mode` status pattern)

## 3. Threshold detection and compaction interaction (pi-1c-agent follow-up)

- [x] 3.1 Idle check (on `agent_end`/idle): read `ctx.getContextUsage()`; if `percent >= threshold` and enabled, arm and perform rotation; if `percent` is `null`, skip and re-check next idle
- [x] 3.2 Handle `session_before_compact`: when enabled and `reason === "threshold"`, cancel (`{ cancel: true }`) and arm rotation; allow `overflow` and `manual` to proceed
- [x] 3.3 Ensure suppression is "cancel once" — the same context is never both compacted and rotated
- [x] 3.4 Overflow fallback: never cancel `overflow` compaction; defer rotation to the next idle point after the turn completes

## 4. Rotation and handoff (pi-1c-agent follow-up)

- [x] 4.1 On rotation, invoke the handoff skill to produce `handoffs/handoff-<timestamp>.md` in the profile handoff format; abort rotation if the file is missing/empty
- [x] 4.2 Guarantee the handoff excludes secrets, credentials, `.dev.env`, and full transcript/tool dumps
- [x] 4.3 Call `ctx.newSession({ parentSession, setup, withSession })`: `parentSession` = current session file; `setup` seeds the persisted rotate-state entry so the setting carries over
- [x] 4.4 In `withSession`, send the kickoff via `sendUserMessage` referencing the handoff path and instructing continue-without-rediscovery; do not use captured stale `ctx`
- [x] 4.5 Notify on rotate (TUI) and confirm the new window starts below threshold

## 5. Package tests (pi-1c-agent follow-up)

- [x] 5.1 Test: feature off by default → normal compaction, no rotation
- [x] 5.2 Test: enable/disable and custom threshold set/status; invalid threshold rejected
- [x] 5.3 Test: state persists across resume and carries into the new session on rotation
- [x] 5.4 Test: `threshold` compaction cancelled once when armed; `overflow` compaction allowed
- [x] 5.5 Test: rotation writes a non-empty handoff, then `newSession` with parent linkage and kickoff; aborts when handoff write fails
- [x] 5.6 Test: `getContextUsage().percent === null` → no rotation on that check

## 6. Verification

- [x] 6.1 Live Pi check with a low threshold on a throwaway task: rotation fires at idle, handoff written, new session seeded, setting preserved
- [x] 6.2 Confirm Cursor host: command reports status but does not activate; README gap wording is accurate
- [x] 6.3 Run profile tests (`node tests/run-all.mjs`) and package `doctor --package-only`; record pass/fail
