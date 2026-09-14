# Lab extras register (not ai_rules_1c)

Append-only. Each extras refresh adds a new dated section. Do not rewrite history.

This register is **not** `UPSTREAM-REGISTER.md`. Vanessa/KD/toolkit are author lab beta extras. `humanizer-ru` is a snapshot of Comol `Humanizer_RU` plus this author’s `knowledge/` overlay. None of them belong on the `comol/ai_rules_1c` pin.

Refresh does **not** run upstream `install.ps1`, does **not** call `/review-airules`, and does **not** require an `ai_rules_1c` SHA. `/updaterules` and `/checkupdates` stay for 1C *projects* and must not overwrite these trees as a side effect.

Machine-local lock: `lab-extras.lock.json`.

## Refresh procedure

1. Source of the working tree during beta: author Cursor skills (`~/.cursor/skills/<name>/`). Fallback for Vanessa/KD/toolkit only: `1c-project-scaffold/vendor/<name>/`. Do **not** copy the English `humanizer` skill. Do **not** copy EPF/CFE binaries.
2. Copy the updated tree into `$PI_CODING_AGENT_DIR/skills/<name>/` (docs, references, scripts, Humanizer `knowledge/`).
3. Keep extra/beta banners and profile paths (`$PI_CODING_AGENT_DIR/skills/…`, project `.dev.env`). Strip required `/home/<user>/`, `/mnt/vol_*`, `C:/Users/<someone>` paths.
4. Append a dated section below. Update `lab-extras.lock.json` snapshot date / source id. For `humanizer-ru` you MAY record a `Humanizer_RU` SHA already cited in the skill — never an `ai_rules_1c` SHA.
5. Leave `UPSTREAM-REGISTER.md` and `upstream.lock.json` unchanged.

## Baseline

- **Date:** 2026-09-14
- **Source:** author Cursor skills (`cursor-skills`); Vanessa/KD/toolkit fallback would have been `1c-project-scaffold/vendor/`
- **Status:** extra / beta (Vanessa, KD 2, KD 3, MCP Toolkit); extra / snapshot (Humanizer RU)
- **Trees:**
  - `skills/vanessa-mcp` — lab beta extra, not `ai_rules_1c`
  - `skills/kd2-rules` — lab beta extra, not `ai_rules_1c`
  - `skills/kd31-rules` — lab beta extra, not `ai_rules_1c`
  - `skills/1c-mcp-toolkit` — lab beta extra, not `ai_rules_1c`
  - `skills/humanizer-ru` — Comol `Humanizer_RU` snapshot + author `knowledge/` overlay, not `ai_rules_1c`, not English `humanizer`
- **Action:** first snapshot into the Pi 1C profile
- **Not touched:** `UPSTREAM-REGISTER.md`, `upstream.lock.json`, `/review-airules`
