---
description: "[settings] Update the Pi CLI shell (@earendil-works/pi-coding-agent) in its npm prefix"
---

# /update-pi-cli — update the Pi CLI shell to the current version

Update the **Pi CLI shell** (`@earendil-works/pi-coding-agent`) in its detected npm prefix without overwriting profile configurations, MCP servers, or secrets. This is not `/update-profile` (git profile refresh), not `/updaterules` (1C project rules), and not `pi update --all` (which could alter package settings).

Target is the detected npm prefix containing the `pi` binary, never a 1C project directory.

In **Pi**, this command mutates files: it requires **BUILD**. If the session is ASK or PLAN, say so, tell the user to `/mode build`, and stop. Cursor does not enforce modes; run the helper as a procedure.

## Arguments

Parse `$ARGUMENTS` (case-insensitive for verbs).

| Argument | Effect |
|---|---|
| empty | Update to latest version if current is older (default) |
| `status` / `check` | Read-only check: reports current version, latest version, prefix, and whether Pi CLI is up to date |
| `force` / `overwrite` | Reinstall target version even if current version matches |
| a version (e.g. `0.86.0`) | Install that specific version instead of latest |

## Steps

1. Prefer the helper (Node stdlib + `npm` on PATH):

   ```bash
   node "$PI_CODING_AGENT_DIR/scripts/update-pi-cli.mjs" $ARGUMENTS
   ```

   On Windows, the same `node` invocation with `%PI_CODING_AGENT_DIR%\scripts\update-pi-cli.mjs`.

2. If `node` or the helper file is missing, do **not** run unmanaged `npm install -g` or `pi update --all`. Print the helper's copy-paste (`npm install --prefix "$PI_PREFIX" --ignore-scripts @earendil-works/pi-coding-agent@latest`) **once** and stop.

3. Report the helper output: `result`, `state`, `prefix`, `current_version`, `target_version`.

4. Do **not** run `pi update --all`, `pi update --extensions`, `git pull`, or `/update-profile` as part of this command. After updating, recommend restarting the Pi CLI session to load the updated binary, then checking with `/doctor`.

## Preserve

- `settings.json` — custom model defaults, thinking levels, `packages[]` paths, and theme preserved
- `mcp.json` — all registered and opted-in MCP servers preserved
- `auth.json`, `trust.json` — byte-identical
- Sibling directories in prefix (`config-1c`, `config-devops`, `sessions`, etc.) preserved intact

`status` never writes files.
