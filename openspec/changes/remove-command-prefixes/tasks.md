## 1. Profile prompts

- [x] 1.1 Delete all `prompts/1c-*.md`
- [x] 1.2 Delete `prompts/init.md` and `prompts/doctor.md`
- [x] 1.3 Update `CATALOG.md`, `commands.md`, remaining prompt alias wording

## 2. Docs and rules

- [x] 2.1 `AGENTS.md`, `README.md`, `openspec/project.md`
- [x] 2.2 `rules-1c/core/{modes,project-init,knowledge,openspec,extension-targeting}.md`
- [x] 2.3 Update `productize-pi-1c-agent` command-surface spec (close alias window)

## 3. Tests

- [x] 3.1 `tests/lib/commands.mjs`: drop alias helpers; assert no `1c-*.md`
- [x] 3.2 Invert `tests/contract/command-surface.test.mjs` and `catalog.test.mjs`
- [x] 3.3 Drop alias unit tests and fixtures; update `tests/README.md`

## 4. Package `pi-1c-agent`

- [x] 4.1 Unprefix `registerCommand` in all five extensions; drop plan/build/execute-plan
- [x] 4.2 Rename package prompts to `bugfix` / `implement` / `review`
- [x] 4.3 Update package tests and `tools/doctor.mjs`
- [x] 4.4 Docs + regenerate SHA manifests

## 5. Installed profile and verify

- [x] 5.1 Sync `/mnt/vol_328/Pi/config-1c`
- [x] 5.2 `node tests/run-all.mjs` (profile) and package `tests/run-all.mjs` + doctor/verify
