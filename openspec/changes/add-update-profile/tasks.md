## 1. Deterministic helper

- [x] 1.1 Add `tools/update-profile.mjs` (Node stdlib + `git` on PATH): resolve target as `$PI_CODING_AGENT_DIR` or loaded profile root, never project cwd; identify a profile by `PI-1C-AGENT` + `prompts/CATALOG.md` + `rules-1c/`
- [x] 1.2 Implement `status`/`check` (read-only) and default update: `git fetch` + fast-forward only; refuse dirty tracked files and non-ff; `force`/`overwrite` does `reset --hard` to the default ref
- [x] 1.3 Default remote `origin`; default ref = current upstream, else `origin/HEAD`, else `origin/main`; optional ref argument; missing git / no `.git` / no remote → non-zero, copy-paste, no loop, no clone
- [x] 1.4 Before mutate: backup `mcp.json` and `settings.json`. After ff/reset: restore extra MCP servers vs pre-update shipped default; restore a local `pi-1c-agent` filesystem path in `packages`. Leave `auth.json`, `trust.json`, `npm/` untouched
- [x] 1.5 Print old/new SHAs, redacted remote URL, and an optional reminder `pi install npm:pi-cursor-sdk`. Never print tokens or `auth.json`

## 2. Command surface

- [x] 2.1 Add `prompts/update-profile.md`: Settings command, BUILD required in Pi, arguments `status|check|force|overwrite|<ref>`, helper-first with copy-paste fallback that still preserves local files
- [x] 2.2 Add alias stub `prompts/1c-update-profile.md` (`description: Alias of /update-profile`) that follows `prompts/update-profile.md`
- [x] 2.3 Add a Settings row in `prompts/CATALOG.md` (not Everyday): refresh this Pi profile from the clone’s git remote — not `/updaterules`
- [x] 2.4 In `prompts/updaterules.md`, add one sentence: to refresh **this profile** from the owner’s git remote, use `/update-profile`
- [x] 2.5 Add `/doctor` WARN (not FAIL CORE) in `prompts/doctor.md` when the clone is behind its default remote or has no usable remote; name `/update-profile`
- [x] 2.6 README: after clone/deploy, document `/update-profile` as the refresh path; keep first-install as clone; do not auto-update npm

## 3. Tests

- [x] 3.1 Unit-test helper helpers in a temp clone: profile vs project-cwd target, missing git, dirty refuse, ff success, status no-write, secret-file byte identity, extra MCP server kept, local package path kept, npm dir untouched, URL redaction
- [x] 3.2 Extend `tests/contract/catalog.test.mjs` so `/update-profile` is classified `settings`
- [x] 3.3 Contract: `prompts/update-profile.md` and `prompts/1c-update-profile.md` exist; alias is a stub; command-surface alias loop still passes
- [x] 3.4 Add a coverage-table row in `tests/README.md` for profile self-update from git remote

## 4. Verification

- [x] 4.1 Run `node tests/run-all.mjs` and fix until the deterministic suite is green
- [x] 4.2 Manual: `/update-profile status` on this clone reports behind/ahead/current/dirty without writing; `/commands` lists the Settings row
- [x] 4.3 Do **not** implement `pi-1c-agent` `registerCommand` in this APPLY (palette loads the prompt file)
