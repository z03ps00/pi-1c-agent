## Why

A fresh clone of this Pi 1C profile lists `npm:pi-cursor-sdk@0.3.6` in `settings.json` but never actually installs it: README deploy does not run `pi install`, and the pin will keep shipping a frozen version after newer releases land at [fitchmultz/pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk). Operators who expect Cursor models inside Pi after a default install get a declared package that is neither downloaded nor kept current.

## What Changes

- Default profile install includes the Cursor SDK provider from that GitHub project as a first-class package, not an optional extra.
- The shipped `packages` entry becomes an **unpinned** `npm:pi-cursor-sdk` specifier so `pi install` downloads the **latest published** version at install (and on a documented refresh), instead of `@0.3.6`.
- README / doctor / contract tests describe and lock that default: listing, download step, and “no version pin in git”.
- Install does **not** switch `defaultProvider` / `defaultModel` away from DeepSeek, does **not** require a Cursor API key, and does **not** vendor the plugin into this git tree.
- Offline or failed download: the specifier stays in `settings.json`; `/doctor` WARNs that the package is not on disk; 1C work with DeepSeek still proceeds.

## Capabilities

### New Capabilities

- `profile-packages`: default Pi packages shipped with this profile, how they are declared in `settings.json`, and that install actually fetches the current `pi-cursor-sdk` from npm (source project: https://github.com/fitchmultz/pi-cursor-sdk).

### Modified Capabilities

- None. Main `openspec/specs/` has no archived capabilities yet. Test-suite coverage of the new invariant is part of this capability, not a delta on the still-unarchived `profile-test-harness` change.

## Impact

- `settings.json` `packages` array (replace `npm:pi-cursor-sdk@0.3.6` with unpinned `npm:pi-cursor-sdk`).
- `README.md` deploy steps (run `pi install` so the latest tarball is fetched).
- `prompts/doctor.md` (WARN when the specifier is missing, pinned, or the package is not installed).
- `tests/contract/notice-settings.test.mjs` (assert unpinned `npm:pi-cursor-sdk`; keep the `<path-to-pi-1c-agent>` placeholder rule).
- Network at install time (npm registry). No change to default MCP servers, lab extras, or `auth.json`.
- Existing profiles that already have `@0.3.6` need one `pi install npm:pi-cursor-sdk` to pick up later releases; that is documented, not a silent rewrite of live `auth.json`.
