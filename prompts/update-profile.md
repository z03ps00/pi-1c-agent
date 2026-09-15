---
description: "[settings] Refresh this Pi 1C profile from its git remote (not /updaterules)"
---

# /update-profile — refresh this Pi profile from the clone’s git remote

Update the **installed Pi 1C profile** (`$PI_CODING_AGENT_DIR`) from that clone’s git remote (default `origin`). This is not `/updaterules` (1C projects), not `/checkupdates`, not `/review-airules`, and not an infobase load.

Target is always the profile root, never the current working directory of a 1C project, never `.dev.env`.

In **Pi**, this command mutates files: it requires **BUILD**. If the session is ASK or PLAN, say so, tell the user to `/mode build`, and stop. Cursor does not enforce modes; still run the helper as a procedure.

## Arguments

Parse `$ARGUMENTS` (case-insensitive for the verbs). Do not treat a 1C project path as a ref.

| Argument | Effect |
|---|---|
| empty | Fast-forward a **clean** tree (local `mcp.json` / `settings.json` customizations do not block) |
| `status` / `check` | Read-only: behind / ahead / current / dirty / no-remote. No working-tree writes. If fetch fails, still report against last known remote-tracking refs and say that the numbers may be stale |
| `force` / `overwrite` | Confirmed `git reset --hard` to the default ref, then restore MCP extras and the local `pi-1c-agent` path |
| a branch or tag | Use that ref instead of the default (upstream, else `origin/HEAD`, else `origin/main`) |

`force` plus a ref is allowed. Unrecognised tokens that look like a ref are passed through to the helper; do not guess a GitHub URL.

## Steps

1. Resolve the profile directory: `$PI_CODING_AGENT_DIR` if set, otherwise the loaded profile (this overlay). Confirm it has `AGENTS.md` with `PI-1C-AGENT`, `prompts/CATALOG.md`, and `rules-1c/`. If not, stop: clone per README. Do not `git clone` into a new folder.
2. Prefer the helper (Node stdlib + `git` on PATH):

   ```bash
   node "$PI_CODING_AGENT_DIR/scripts/update-profile.mjs" $ARGUMENTS
   ```

   On Windows, the same `node` invocation with `%PI_CODING_AGENT_DIR%\scripts\update-profile.mjs`.
3. If `node` or the helper file is missing, **do not** invent `git reset --hard`. Print the helper’s copy-paste (`git -C "$PI_CODING_AGENT_DIR" fetch origin` then `merge --ff-only`) **once** and stop unless the user already confirmed a manual run. If you must run git yourself: copy `mcp.json` and `settings.json` aside first, never delete `auth.json` / `trust.json` / `npm/`, restore extra `mcpServers` that are not in the incoming default, and put back a local filesystem path for `pi-1c-agent` in `settings.json` `packages`. If no local path was set and `packages/pi-1c-agent/package.json` exists in the clone, use that absolute path instead of the placeholder.
4. Report the helper output: `state`, redacted `remote_url`, `old_sha` / `new_sha`. Do not print tokens, `auth.json`, or credentialed userinfo.
5. Do **not** run `pi install`, `npm install`, `install.ps1`, or `/review-airules`. After a successful **updated** result, you MAY mention `pi install npm:pi-cursor-sdk` as a separate optional step. Recommend `/doctor` and a client reload so new prompts load.

## Preserve

- `auth.json`, `trust.json` — byte-identical
- Opted-in `mcp.json` servers that are not in the incoming shipped default
- Local `settings.json` path for `pi-1c-agent` (not the `<path-to-pi-1c-agent>` placeholder)
- `npm/` / `node_modules`

Default update **stops** if other tracked files are dirty or the update would not fast-forward. `status` never writes working-tree files.

## Missing git / not a clone

Stop, say why, print host copy-paste once, do not retry in a loop, do not clone.
