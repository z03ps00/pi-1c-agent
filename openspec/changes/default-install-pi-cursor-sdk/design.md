## Context

See `proposal.md` for why. Today `settings.json` already lists `npm:pi-cursor-sdk@0.3.6` next to `npm:pi-mcp-adapter@2.32.1` and the `<path-to-pi-1c-agent>` placeholder. That pin matches the last npm release as of 2026-09-15, but (1) README deploy never runs `pi install`, so a clone does not download the plugin, and (2) a later npm release would stay invisible until someone edits git.

Pi package install is: `PI_CODING_AGENT_DIR=<profile> pi install <spec>` from a neutral cwd. Both `pi-cursor-sdk` and the retired `@jiah-liu/pi-cursor-provider` register provider id `cursor`, so a swap still needs remove-then-install; this change is not a swap, it is “declare + fetch latest”.

Target container: this **profile git tree**, not a 1C CFE. The sibling `pi-1c-agent` package is out of this repo; no bootstrap change there unless APPLY finds an installer that copies `settings.json` and would re-pin.

## Goals / Non-Goals

**Goals:**

- One unpinned specifier in shipped `settings.json`.
- One documented install/refresh command that hits npm latest.
- Doctor WARN + a contract test so the pin cannot sneak back.
- Keep DeepSeek as the default model; Cursor remains available after `/login`.

**Non-Goals:**

- Vendoring the plugin or `@cursor/sdk` into this git tree.
- Changing `pi-mcp-adapter@2.32.1` (stays pinned; out of scope).
- Switching `defaultProvider` / `defaultModel` to `cursor/*`.
- Installing from git HEAD by default (`pi install https://github.com/fitchmultz/pi-cursor-sdk`).
- Auto-writing `CURSOR_API_KEY` or touching `auth.json`.
- Making live scenario tests (`RUN_LIVE_SCENARIOS=1`) part of the default suite.
- Teaching `/init` (1C project wizard) to install Pi packages.

## Decisions

### 1. Unpinned npm specifier, not a new pin and not git HEAD

- **Choice:** `packages` entry is exactly `npm:pi-cursor-sdk`. Install/refresh is `pi install npm:pi-cursor-sdk`.
- **Why:** The plugin README’s first command is that specifier; npm latest is the published, OS-correct tarball (the package does not bundle `@cursor/sdk` native bits). GitHub HEAD can be unreleased (several tags note “no npm publish”).
- **Rejected:** Keep `@0.3.6` (contradicts “актуальная версия” on the next release). Pin-to-whatever-is-latest-today (same freeze next week). Default `pi install https://github.com/fitchmultz/pi-cursor-sdk` (git HEAD, wrong optional native binary risk, not what most Pi users run).

### 2. Download is a documented deploy step, not a git hook

- **Choice:** README “Deploy on another machine” grows a step: with `PI_CODING_AGENT_DIR` set to the clone, run `pi install npm:pi-cursor-sdk`. Existing profiles with `@0.3.6` run the same command once after pulling this change.
- **Why:** Pi, not this repo, owns the npm cache under the profile. There is no installer script in this tree today; inventing one would duplicate `pi install`.
- **Rejected:** A `postinstall` / bootstrap that shells `pi install` from git clone (needs Pi on PATH, surprises offline clones, mutates the profile outside doctor). Checking the plugin into `npm/` (161 MB, OS-specific, already a portability smell).

### 3. Doctor WARN, not CORE fail

- **Choice:** Missing specifier, leftover `@version`, or package not on disk → WARN. CORE stays about machine paths, unsolicited MCP, command collisions.
- **Why:** Default model is DeepSeek; 1C work must not be blocked by npm or a Cursor key. Live tests already skip without the SDK.
- **Rejected:** FAIL CORE if the plugin is absent (punishes air-gapped clones). Silent ignore (the original bug).

### 4. Contract test on the string, not a live npm call

- **Choice:** Extend `tests/contract/notice-settings.test.mjs` (or a sibling in the same file) to require `packages.includes('npm:pi-cursor-sdk')` and reject `/^npm:pi-cursor-sdk@/`. Default `node tests/run-all.mjs` stays offline.
- **Why:** Matches `profile-test-harness`: deterministic suite must not install dependencies.
- **Rejected:** Hitting registry.npmjs.org in CI. Asserting a resolved version in `package-lock` we do not ship.

### 5. Adapter pin stays; only the Cursor provider is unpinned

- **Choice:** Leave `npm:pi-mcp-adapter@2.32.1` as-is.
- **Why:** User asked only for pi-cursor-sdk; unpinning the MCP adapter is a different compatibility surface.
- **Rejected:** Unpin every `npm:` entry “for consistency”.

## Risks / Trade-offs

- **[Risk] A future `pi-cursor-sdk` major can break Pi 0.85 / `@cursor/sdk` peer assumptions** → Mitigation: doctor WARN stays; README notes Node 22.19+ and Pi ≥ 0.84 from upstream; if a break lands, re-pin in a new change rather than silently staying on a broken latest. Do not add a lockfile in this profile.
- **[Risk] npm latest lags GitHub main** → Mitigation: default path is npm by design; README may mention the GitHub URL for maintainers who explicitly want HEAD.
- **[Risk] Two `cursor` providers if someone still has `@jiah-liu/pi-cursor-provider`** → Mitigation: README refresh step: `pi list` must show one cursor package; `pi remove` the old id first if present (already the 2026-09-13 swap lesson).
- **[Risk] `settingSources=all` pulling host Cursor MCP** → Mitigation: out of scope; do not change `PI_CURSOR_SETTING_SOURCES` here. Mention in README as optional env if first-token latency spikes.
- **[Trade-off] Unpinned vs reproducible installs** → Reproducibility of *this profile git* is the specifier string; the downloaded tarball is intentionally time-of-install. Operators who need a freeze can pin locally; shipped git must not.

## Migration Plan

1. Pull this change. Replace `@0.3.6` in `settings.json`.
2. `PI_CODING_AGENT_DIR=<clone> pi install npm:pi-cursor-sdk` (remove any leftover `@jiah-liu/pi-cursor-provider` first if `pi list` shows it).
3. Restart Pi. `/login` → Cursor API key only if the user wants Cursor models.
4. Rollback: restore `npm:pi-cursor-sdk@0.3.6` and `pi install npm:pi-cursor-sdk@0.3.6`, or `pi remove npm:pi-cursor-sdk` if Cursor is unwanted. DeepSeek defaults are untouched.

## Open Questions

None that block APPLY. npm vs GitHub HEAD is decided (Decision 1).
