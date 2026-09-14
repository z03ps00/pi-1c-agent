---
description: Print the 1C command catalog — everyday first, then settings, then maintainer
---

# /commands — product catalog

Print the catalog from `prompts/CATALOG.md` in this order:

1. **Everyday** (bounded, at most twelve) — first, in full.
2. **Settings** — short list, marked `[settings]`.
3. **Maintainer** — advanced, marked `[maintainer]`.

Rules:

- Canonical names have no `1c-` prefix. If the user ran `/1c-commands`, say once that it is an alias of `/commands`.
- `/review-airules` belongs under maintainer, not everyday.
- Do **not** invent `/help`, `/plan`, `/build`, or `/debug` as 1C commands. Cursor `/help` stays Cursor’s help. Modes are `/mode plan|build|ask`. Anonymous session is `/anon`.
- Settings and maintainer commands remain invocable by exact name even when they are not in the everyday section. If the user ran a maintainer command by name, state that it is a maintainer command.

If `$ARGUMENTS` names a command, print only that row plus whether it is everyday, settings, or maintainer.
