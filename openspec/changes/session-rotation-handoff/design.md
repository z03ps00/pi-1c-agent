## Context

See `proposal.md — Why`. Runtime lives in `pi-1c-agent` (0.6.1, outside this git tree); this repo is the profile. Pi 0.85 already ships the primitives this design needs:

- `ctx.getContextUsage()` → `{ tokens, contextWindow, percent }` (percent can be `null` right after compaction).
- Event `session_before_compact` with `reason: "manual" | "threshold" | "overflow"`; the handler may return `{ cancel: true }`.
- `ctx.newSession({ parentSession, setup, withSession })` on `ExtensionCommandContext`; `withSession` receives a fresh `ReplacedSessionContext` with `sendUserMessage`.
- State persistence via `pi.appendEntry` + replay on `session_start`, exactly how `1c-mode` and `caveman` persist their state.
- Existing `skills/handoff` produces `handoffs/handoff-<timestamp>.md` in the profile's handoff format.

Pi's own auto-compaction triggers at `contextTokens > contextWindow - reserveTokens` (default reserve 16384; for a 256k window that is ~94%). The rotation threshold (85%) is deliberately lower so rotation fires first, at idle, before Pi's overflow path.

## Goals / Non-Goals

**Goals:**

- One opt-in switch that replaces threshold compaction with handoff + fresh session, off by default.
- Reuse the handoff skill format; do not invent a second summary format.
- Never drop a running turn: overflow compaction stays as fallback.
- Keep the setting sticky across compaction, resume, and rotation.

**Non-Goals:**

- Changing Pi's default compaction settings in `settings.json`.
- Making Cursor enforce this (documented dual-host gap only).
- Auto-tuning the threshold or model-specific thresholds (single integer percent).
- Chaining rotations by design; each rotation is independent and the new window simply starts low.

## Decisions

### 1. Trigger point: `session_before_compact` with `reason === "threshold"`, not a polling timer

**Choice:** arm rotation by handling `session_before_compact`. When the feature is enabled and `reason === "threshold"`, cancel the compaction (`{ cancel: true }`) and schedule a rotation to run at the next idle point. Let `reason === "overflow"` and `reason === "manual"` proceed normally.

Because Pi's threshold (~94%) is higher than our 85%, also arm a lighter idle check: on `agent_end` (or equivalent idle hook) read `ctx.getContextUsage()`; if `percent >= threshold`, run the rotation directly and pre-empt Pi's own threshold compaction. `session_before_compact` cancellation is the backstop if the idle check missed.

**Alternative considered:** a pure `getContextUsage()` poll with no compaction hook. Rejected: without cancelling `session_before_compact`, Pi could compact the same context we are about to rotate, doubling work and cost.

### 2. Rotation must run from a command-capable context

`ctx.newSession()` exists only on `ExtensionCommandContext` / command handlers, not on plain event `ctx`. **Choice:** the actual `newSession` call happens inside the `/session-rotate` command path and a small internal rotation routine invoked when idle; event handlers only set a "rotation armed" flag and cancel threshold compaction. The docs warn captured `pi`/`ctx` are stale after replacement — all post-switch work uses the `ReplacedSessionContext` passed to `withSession`.

### 3. Handoff generation reuses `skills/handoff`

**Choice:** the rotation asks the model to produce the handoff via the existing handoff skill flow (a real summary), then writes `handoffs/handoff-<timestamp>.md`. This is better than serializing raw messages: a dump would leave the new session as blind as compaction. The rotation reads back the file path and only rotates if the file exists and is non-empty.

**Alternative considered:** synthesize the handoff from `serializeConversation()` directly in the extension (like `custom-compaction.ts`). Rejected for quality; kept as a possible degraded fallback if the skill is unavailable, noted as an open question.

### 4. Kickoff into the new session

**Choice:** `withSession(async (ctx) => ctx.sendUserMessage(kickoff))` where kickoff = "Continue the 1C task. Read the handoff at `<path>`; do not repeat completed discovery; finish the remaining next steps." `parentSession` is set to the previous session file for traceability.

### 5. Command surface: `/session-rotate`, Settings tier, alias `/1c-session-rotate`

**Choice:** canonical unprefixed `/session-rotate on|off|status|<percent>`, one-release `/1c-session-rotate` alias, listed in `prompts/CATALOG.md` Settings tier next to `/caveman`. Matches the profile's command conventions (no `1c-` in canonical names, no collision with reserved `/new`, `/compact`, `/mode`).

**Alternative considered:** overload `/compact`. Rejected: `/compact` is a reserved core command; we must not shadow it.

### 6. Threshold bounds 50–95, default 85

**Choice:** clamp to integer 50–95. Below 50 rotates uselessly often; above 95 collides with Pi's own overflow reserve. Default 85 per the user's request. Invalid input is rejected and the previous value kept.

### 7. Persistence mirrors `caveman`/`1c-mode`

**Choice:** persist `{ enabled, thresholdPercent }` with `pi.appendEntry("pi-1c-session-rotate-state", …)`; restore on `session_start` by scanning entries (last wins). On rotation, `setup` seeds the same state entry into the new session so the setting carries over.

### 8. APPLY vs package (mirrors `productize-pi-1c-agent` decision 8)

| Work | Where |
|---|---|
| `prompts/session-rotate.md` + `/1c-session-rotate` alias, `CATALOG.md` entry, `README.md` dual-host note, handoff-skill reuse note | This repo |
| Extension code (`getContextUsage`, `session_before_compact` cancel, idle check, `newSession`, `registerCommand("session-rotate")`, state persistence) + package tests | `pi-1c-agent` follow-up |

## Risks / Trade-offs

- Cancelling `session_before_compact` but failing to rotate → context stays full. **Mitigation:** only cancel when a rotation is actually armed and idle; if rotation aborts (handoff failed), do not cancel/allow Pi compaction to run.
- `getContextUsage().percent` is `null` right after compaction → false negative. **Mitigation:** treat `null` as "skip this check", re-evaluate next idle; overflow fallback still protects the turn.
- Handoff quality depends on the model summarizing well. **Mitigation:** reuse the proven handoff skill; abort rotation if the file is empty.
- Rotation mid-work could confuse a user watching the TUI. **Mitigation:** footer status + a notify on rotate; the new session's kickoff is visible.
- Stale captured `ctx` after `newSession` (documented footgun). **Mitigation:** do all post-switch work inside `withSession`.
- Cursor users expect the same behavior. **Mitigation:** documented Pi-only gap; the command still reports status under Cursor but does not activate.

## Migration Plan

1. Land profile artifacts (command template, alias, catalog, README note). Feature is inert until the package ships.
2. Implement the extension in `pi-1c-agent`; default off. Package tests cover: threshold detection, `session_before_compact` cancel-once, overflow passthrough, `newSession` kickoff, persistence carry-over, invalid-threshold rejection.
3. Verify in Pi with a low threshold on a throwaway task; confirm handoff written, new session seeded, setting preserved.
4. Rollback: `git revert` of the profile change and disable/remove the extension fragment; nothing else depends on it.

## Open Questions

- Whether to keep a `serializeConversation()`-based degraded handoff when the handoff skill is unavailable — can be added later without changing the observable contract.
- Idle hook resolved at APPLY: use `agent_settled` (fires after retry/compaction/queued continuation have finished), not `agent_end`.
