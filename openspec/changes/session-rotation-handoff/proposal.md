## Why

When a long Pi 1C session fills its context window, Pi compacts: it summarizes older turns inside the same window. Compaction is lossy and stays in a window that is already near its limit, so late-task quality drops. The user wants an opt-in alternative: near a context threshold the agent should write a session handoff, open a **fresh** session, and finish the work using that handoff as its seed — instead of compacting in place. This must be a switch the user turns on and off; when off, nothing changes.

## What Changes

- Add an opt-in **session rotation** behavior for the Pi 1C runtime: when context usage crosses a threshold (default **85%**), the agent writes a handoff, starts a new session with a clean window, and continues from the handoff rather than running in-place compaction.
- Add a settings-tier command to toggle and configure it (canonical `/session-rotate` with `on | off | status | <percent>`), default **off**, persisted in session state like `/caveman`.
- Reuse the existing `handoff` skill format for the rotation handoff (goal, done, files changed, verification, next steps, what to load next); never copy secrets or full transcripts.
- Suppress Pi's normal `session_before_compact` once per rotation when the feature is armed and the agent is idle; keep in-place compaction as the fallback for a single oversized turn (overflow) so a running turn is never dropped.
- Seed the new session with a kickoff message that points at the handoff file and instructs the agent to continue without redoing discovery.
- Document the behavior and the **dual-host gap**: this runs in Pi (`pi-1c-agent` extension); Cursor has no equivalent hook, so the option is Pi-only.
- No default-behavior change: with the option off, Pi compaction and the manual `/handoff` skill work exactly as today.

## Capabilities

### New Capabilities
- `session-continuation`: opt-in context-threshold session rotation — detect context fill, emit a handoff, start a fresh session, and continue the task from that handoff instead of compacting; includes the toggle command, threshold config, persistence, and the compaction/overflow interaction.

### Modified Capabilities
<!-- None: agent-runtime-contract and command-surface are referenced from design.md but their existing requirements do not change. This change only adds a new capability. -->

## Impact

- **Package `pi-1c-agent`** (outside this git tree): a Pi extension using `ctx.getContextUsage()`, the `session_before_compact` event, and `ctx.newSession({ parentSession, setup, withSession })`; a new `registerCommand("session-rotate")`; state persisted via `pi.appendEntry`.
- **This profile repo**: a `prompts/session-rotate.md` command template + `/1c-*` alias, catalog entry in `prompts/CATALOG.md` (Settings tier), a note in `README.md` (dual-host gap), and reuse of `skills/handoff`. Package-side code is a follow-up documented here, mirroring the `productize-pi-1c-agent` APPLY-vs-package split.
- **Settings**: no change to `settings.json` compaction defaults; the feature is off unless the user enables it.
- **No 1C metadata / CFE / infobase impact.**
