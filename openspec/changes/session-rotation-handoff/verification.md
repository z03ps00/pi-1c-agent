# Verification — session-rotation-handoff

Recorded 2026-09-15 during APPLY.

| id | what | result |
|---|---|---|
| 1.1–1.5 | Profile command, alias, catalog Settings row, README dual-host, handoff skill reuse | pass |
| 2.1–2.4 | Package state persist, `/session-rotate` + alias, threshold 50–95, footer `rotate:off` / `rotate:N%` | pass (package tests + extension) |
| 3.1–3.4 | Idle `agent_settled`, cancel threshold compact once when idle, overflow deferred | pass (unit + extension wiring) |
| 4.1–4.5 | Handoff skill instruction, secret abort, `newSession` parent + kickoff, notify | pass (unit + extension wiring) |
| 5.1–5.6 | Package `tests/session-rotate.test.mjs` | pass |
| 6.1 | Live Pi TUI low-threshold rotation | **skip** — this APPLY ran in Cursor; no interactive Pi TUI session to fill a context window. Package tests cover the contract. Verify in Pi with `/session-rotate on 50` on a throwaway task. |
| 6.2 | Cursor host: prompt says rotation does not activate; README dual-host gap | pass |
| 6.3 | Profile `node tests/run-all.mjs`; package `node tests/run-all.mjs`; `node tools/doctor.mjs --package-only` | pass — profile 50 passed, 1 skipped (`RUN_LIVE_SCENARIOS` not set); package 75 passed; doctor CORE PASS |
