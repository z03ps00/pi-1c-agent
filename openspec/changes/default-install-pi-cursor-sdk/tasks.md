## 1. Declare the unpinned package

- [x] 1.1 In `settings.json`, replace `npm:pi-cursor-sdk@0.3.6` with exactly `npm:pi-cursor-sdk`. Leave `npm:pi-mcp-adapter@2.32.1`, `<path-to-pi-1c-agent>`, and DeepSeek `defaultProvider` / `defaultModel` unchanged
- [x] 1.2 Grep the shipped tree (exclude `openspec/changes/**`) for leftover `pi-cursor-sdk@` pins and `@jiah-liu/pi-cursor-provider`; none must remain as the default specifier

## 2. Document default install and refresh

- [x] 2.1 In README “Deploy on another machine”, add a step: with `PI_CODING_AGENT_DIR` set to the clone, run `pi install npm:pi-cursor-sdk` so npm latest is downloaded. Name https://github.com/fitchmultz/pi-cursor-sdk as the source. Do not make `pi install <github-url>` the default command
- [x] 2.2 Document refresh (`pi install npm:pi-cursor-sdk` again, no git version bump) and the old-provider collision: if `pi list` still shows `@jiah-liu/pi-cursor-provider`, remove it first so only one `cursor` provider remains
- [x] 2.3 State Node 22.19+ / Pi ≥ 0.84, that a Cursor API key is optional (`/login` later), and that offline/failed npm does not block DeepSeek 1C work. Do not vendor `node_modules` or a tarball into git

## 3. Doctor WARN

- [x] 3.1 Add a `/doctor` check in `prompts/doctor.md`: WARN (not FAIL CORE) when shipped `packages` lacks `npm:pi-cursor-sdk`, still has `npm:pi-cursor-sdk@…`, or the package is not installed on disk. Missing Cursor key must not FAIL CORE

## 4. Contract tests

- [x] 4.1 Extend `tests/contract/notice-settings.test.mjs` so it asserts `packages.includes('npm:pi-cursor-sdk')` and rejects any `npm:pi-cursor-sdk@` suffix. Keep the placeholder and no-machine-path assertions. Do not call npm or `pi install`
- [x] 4.2 Add a coverage-table row in `tests/README.md` for the unpinned default `pi-cursor-sdk` specifier

## 5. Verification

- [x] 5.1 Run `node tests/run-all.mjs` and confirm the new contract assertions pass
- [x] 5.2 Confirm shipped `settings.json` still has DeepSeek defaults and no machine-local package path
- [x] 5.3 If network and `pi` are available: `PI_CODING_AGENT_DIR=<profile> pi install npm:pi-cursor-sdk` then `pi list` shows one cursor package whose version is npm latest (not a git pin). If `pi` or network is missing, record skip with reason — do not fail APPLY solely for that
