---
description: Initialize a 1C project — empty source scaffold or dump from an existing infobase / .cf / .dt
---

# /init — one init wizard

One wizard for a new or newly adopted 1C repository. It configures **project data** (`.dev.env`, project manifest) in the global Pi profile layout. The agent itself must already be present in `$PI_CODING_AGENT_DIR`.

The `/init` TUI lives in the `pi-1c-agent` package (Pi only). Cursor does not run that TUI — follow this prompt as the procedure. `/1c-init` is an alias of `/init`.

## Step 0. Choose the source (first question)

Ask **first**, before any dump or scaffold write:

> Empty source layout, or dump from an existing infobase / `.cf` / `.dt`?

- **Empty scaffold** — configure `.dev.env` and the project manifest; optionally create `src/{cf,cfe,epf,erf}`, `build/{cf,cfe,epf,erf}`, and `docs/techtask`. **Do not** dump an infobase.
- **From infobase / `.cf` / `.dt`** — jump to the dump procedure in `prompts/initproject.md` (same as `/initproject`).

Palette wording must stay distinct: `/init` is the wizard with this choice; `/initproject` is only the from-IB alias.

If the user already passed `empty`, `from-ib`, `from-cf`, or `from-dt` in `$ARGUMENTS`, do not re-ask; take that path.

## Empty scaffold

After Step 0 (empty path):

1. Prefer `/init advanced` once the project is trusted and Pi is in BUILD (or follow `project-init.md` in Cursor).
2. **Sibling hints (required).** Look only one directory up: sibling folders that look like 1C projects (`.dev.env`, `src/cf/Configuration.xml`, `.pi/1c/project.yaml`). From their `.dev.env` collect **shared** non-secret values that often match across projects: `PREFIX`, `COMPANY`, `DEVELOPER`, `PLATFORM_VERSION`, `PLATFORM_PATH`, comment markers, `NEW_OBJECTS_IN`, `USE_EDT`, process/model defaults. Never copy `IB_PASSWORD`, `REPOSITORY_PASSWORD`, `SUPPORT_KEY`, or project-specific paths (`INFOBASE_PATH`, `EXPORT_PATH`, extension names).
3. Show the collected set as a proposal with source folder names. Wait: accept all, or the user names what to change/skip. Do **not** write `.dev.env` yet.
4. Ask remaining variables **one by one**. If you can fill a value yourself (autodetect, sibling hint, template default), still **ask and confirm** before using it.
5. Create the empty layout when the user chose it: `src/{cf,cfe,epf,erf}`, `build/{cf,cfe,epf,erf}` (compiled binaries named `OriginalName_YYYYMMDD`), `docs/` and `docs/techtask/` (raw agent TZs). Do not dump an infobase.
6. Redacted preview, write only after explicit Apply. Secrets stay only in local `.dev.env`.
7. Report: empty layout, keys written, directories created. Do not run `/loadfrom1cbase`.

## Lab extras (Vanessa / КД / Humanizer RU)

Ask these **before Apply**, after the main wizard answers. They are extras, not `ai_rules_1c`. Skills stay in `$PI_CODING_AGENT_DIR/skills/`. Apply writes **project data** (or a preference flag) only — never copy the skill trees into the 1C project (no `.cursor/skills`, `.opencode/skills`, `.pi/skills` copies of these extras). Selected extras install on Apply, not as a follow-up skill copy.

Silence, empty reply, or skip is **No** — never treat silence as Yes.

### Questions

1. **Vanessa scenario tests?** yes / no (default No).
2. **Конвертация данных?** none / 2 / 3 / both (default none).
3. **Humanizer RU auto-use** for Russian user-facing prose? yes / no (default No). Explicit «очеловечь» still works from the profile skill even after No.

### Apply (Yes / non-none only)

- **Vanessa=yes:** create `tests/features/` plus companion `tests/fixtures/`, `tests/reports/`, `tests/screenshots/` if missing. Append `VANESSA_MCP_URL` to `.dev.env` only if the user supplied a URL. Do **not** merge `mcp.optional/vanessa.json` until there is an explicit URL/consent (`/install-vanessa-mcp`). Do **not** download Vanessa EPF / VAExtension / `client_mcp.cfe` unless the user confirmed binaries in this run.
- **KD ≠ none:** create `tools/mcp-toolkit/`. Append missing port keys from `dev.env.lab-extras.example` (`MCP_TOOLKIT_PORT=6003`; `KD2_PORT=7003` if 2 or both; `KD31_PORT=6011` if 3 or both). Do **not** download `MCP_Toolkit.epf` unless confirmed. Do **not** register toolkit as an MCP server.
- **Humanizer=yes:** record auto-use only in `.pi/1c/project.yaml` (or equivalent non-secret project flag). Do **not** copy the skill. Do **not** install the Python linter unless the user asked.

### Apply (No / none)

Do **not** create `tests/`, Vanessa `tools/`, or `tools/mcp-toolkit`. Do **not** append those `.dev.env` keys. Do **not** add Vanessa MCP. Do **not** turn on Humanizer auto-use.

### Later enable (no full re-init)

A declined extra can be turned on later without repeating the wizard:

- Vanessa: `/install-vanessa-mcp` or extras re-ask / first-use consent when the user asks for `.feature` work.
- KD: extras re-ask or first-use consent when the user asks for КД 2 / КД 3; then write `tools/mcp-toolkit/` and missing port keys.
- Humanizer: first-use consent on «очеловечь» still loads `$PI_CODING_AGENT_DIR/skills/humanizer-ru/` for that request; auto-use flag is optional.

Do not patch the `ai_rules_1c` `.dev.env.example`. Extra keys live in `dev.env.lab-extras.example`.

## From infobase / `.cf` / `.dt`

State that this is the from-infobase scenario of `/init`, then execute `prompts/initproject.md` from its Step 0. Still ask the lab extras questions above before Apply (same silence=No rules).

## Dual host

Cursor will not enforce Pi PLAN and has no `/init` TUI. In Cursor, this prompt is the whole procedure.
