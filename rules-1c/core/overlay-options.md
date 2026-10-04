# Overlay option pickers

A Pi package command with a small closed option set must open the **same overlay picker** as `/mode` when the argument is empty: title, intro, one row per option with **label + description**. Do not register each option as its own slash command. Do not use a plain `ctx.ui.select` list of values for that choice.

## When this applies

- Empty `/mode`, `/taskmode`, `/anon`, `/approve`, `/learning`, `/sdlc`, `/litemode`, `/uitests`, `/previewmode`, `/caveman`, `/economymode`, `/rulesmodel`, `/capture-model`, `/session-rotate`, `/theme`.
- Empty `/init`: source overlay (`empty` | `from-ib` | `from-cf` | `from-cfe` | `from-dt`), then mode overlay (`standard` | `quick` | `advanced`) for the empty-scaffold path.
- Any **new** package command that takes one of a few named options.

A named argument still skips the picker (`/init from-cfe`, `/mode build`). Cursor has no Pi overlay: follow the same option list in the prompt and wait for an explicit choice.

## How to add a picker

1. Choices live in `packages/pi-1c-agent/lib/ui/` (`option-choices.mjs`, `init-copy.mjs`, or the command's state module). Each item: `value`, `label`, `description`.
2. Overlay helper in `packages/pi-1c-agent/extensions/1c-ui/overlays.ts` uses `pickOverlay` / `overlaySelect`.
3. Empty-argument handler calls that helper. Do not add `/1c-*` aliases.

Catalog and `AGENTS.md` say that empty invocation opens the overlay. `/doctor` CORE checks the registration.
