## Why

The profile is installed by cloning this git repository into `$PI_CODING_AGENT_DIR`, but there is no product command to refresh that clone from the owner’s remote. Users mix this up with `/updaterules` (1C projects) and `/review-airules` (Comol pin review), and currently have to remember ad-hoc `git pull` that can wipe local `mcp.json` opt-in and `settings.json` path substitutions.

## What Changes

- Add a settings-tier command `/update-profile` that updates the **installed Pi 1C profile** on this PC from the clone’s configured git remote (default `origin`).
- Keep `/1c-update-profile` as a one-release alias that states it is an alias of `/update-profile`.
- Fast-forward only by default. If the working tree has tracked local edits, stop and report; overwrite only after an explicit confirm argument.
- Preserve machine-local secrets and customizations: `auth.json`, `trust.json`, opted-in `mcp.json` servers, and the local `settings.json` package path substitution.
- Do **not** auto-update npm packages (`pi-cursor-sdk`). After a successful profile pull, remind the user of the existing `pi install npm:pi-cursor-sdk` refresh.
- Document the command in `prompts/CATALOG.md` (Settings), `README.md` deploy/refresh, and `/doctor` as a WARN when the clone has no remote or is behind `origin`.
- Not a 1C infobase / CFE change. Not `/updaterules`, `/checkupdates`, or `/review-airules`.

## Capabilities

### New Capabilities

- `profile-self-update`: slash command and update contract that refreshes `$PI_CODING_AGENT_DIR` from the owner’s git remote while keeping local secrets and opt-in MCP/settings, distinct from project rules updates.

### Modified Capabilities

- none (no archived main specs yet; catalog placement is specified inside `profile-self-update`)

## Impact

- This git profile: `prompts/update-profile.md`, `prompts/1c-update-profile.md`, `prompts/CATALOG.md`, `prompts/doctor.md`, `README.md`, `tests/contract/catalog.test.mjs` (and coverage table), optional deterministic helper under `tests/`-testable `tools/` if APPLY adds one.
- Target container: the Pi profile (`PI_CODING_AGENT_DIR`), not a 1C extension. `NEW_OBJECTS_IN` / `EXTENSION_NAME` do not apply.
- Package `pi-1c-agent`: optional later `registerCommand("update-profile")`; APPLY here is profile files and tests. The command is a documented procedure that runs on both Pi and Cursor (git on the host).
- Requires `git` on PATH. Missing git → print host copy-paste and stop (no loop).
