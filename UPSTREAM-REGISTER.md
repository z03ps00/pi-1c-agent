# Profile update register (comol/ai_rules_1c)

Append-only. Each applied `/review-airules` plan adds a new dated section. Do not rewrite history. Acknowledge-and-skip still appends a section (items marked skip) and advances the pin in `upstream.lock.json`.

Review is `/review-airules` (read-only). Apply is a later `/opsx-apply` or `/execute-plan`. Never run upstream `install.ps1` against this profile tree.

## Baseline

- **Date:** 2026-09-14
- **Source:** https://github.com/comol/ai_rules_1c
- **From-SHA:** (none — first pin)
- **To-SHA:** `410951e74fd3e6b7a763cf49757935b9a34d3f31`
- **Items:** existing `rules-1c/`, `skills/`, `prompts/`, `agents/` snapshot as adapted for Pi
- **Action:** baseline pin (no copy in this APPLY)
- **Dependencies:** none added
