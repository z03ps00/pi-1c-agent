---
description: "[settings] То же, что /init из базы: существующая ИБ или новая файловая из .cf / .cfe / .dt"
---

# /initproject — alias of /init from-infobase

Alias of `/init` from-infobase. State that once. Do not ask the empty-scaffold versus dump question again.

The project is **always** initialized. Creating a new file infobase and dumping sources from a `.cf` / `.cfe` / `.dt` is **opt-in**. Silence or «нет» still runs ordinary `/init` (standard list, «Всё верно») and does **not** create a base or dump that file.

When the user said **yes** to a new base, produce the working layout other full-cycle commands rely on: main-configuration sources in `{EXPORT_PATH}` (usually `src/cf`), extension sources in `{EXTENSIONS_PATH}\<Name>\`, a git repository with the first snapshot commit, and a filled `.dev.env`. Run it once per project; after that use `/loadfrom1cbase`, `/update1cbase`, `/deploy-and-test`, `/restore-testbase`.

**EDT guard.** A dump from an infobase is a **Designer XML dump**. If `.dev.env` `USE_EDT=true` — or the directory already holds an EDT workspace (`.project`, `DT-INF/`, `src/Configuration.mdo`) — stop and settle the layout with the user first. Never initialize a dump on top of an EDT workspace. Canon — `$PI_CODING_AGENT_DIR/rules-1c/rules/edt-workflow.md`.

**Double-init guard.** If `{EXPORT_PATH}` already contains dumped sources (`Configuration.xml` at its root), the project is already initialized — stop and suggest `/loadfrom1cbase` or `/restore-testbase`. Re-initializing over an existing dump requires an explicit user request. This guard applies to a dump (scenario A, or B after «да»). Ordinary `/init` after «нет» still writes missing scaffold dirs without wiping existing dumps.

## Step 0. Check `.dev.env` parameters

`.dev.env` is the single source of truth (canon — `dev-standards-env.md`). If it is missing, the ordinary `/init` wizard creates it — do not send the user to `install.ps1 init` as the only path.

**Shared values from sibling projects.** Before asking blocking keys, scan **one directory up** for similar 1C projects and propose non-secret shared values (`PLATFORM_PATH`, `PREFIX`, `DEVELOPER`, `COMPANY`, …) with source folder names. Wait for accept or corrections. Do not copy secrets or `INFOBASE_PATH` from neighbors.

Keys: `PLATFORM_PATH` (**blocking** whenever a platform operation will run), `INFOBASE_PATH` / `INFOBASE_KIND` (blocking for scenario A; written by scenario B only after «да»), `IB_USER` / `IB_PASSWORD`, `EXTENSION_NAMES`, `EXPORT_PATH` (empty = `src/cf` after a dump of the main configuration), `EXTENSIONS_PATH` (empty = `src/cfe` after a dump of an extension), `LOG_PATH`, `IBCMD_CONFIG`. Only blocking keys are asked about; answers go into `.dev.env`. Defaulted keys resolve silently.

## Step 1. Choose the source scenario

Resolve from the argument, or ask once when ambiguous:

- **A. `from-ib`** — an **existing** infobase is the source of truth. Default when `INFOBASE_PATH` is filled and no file argument was given. It must be a dev/test base or a base the user explicitly designates as the dump source; never run against production without an explicit dump-only confirmation. Then Step 2 (extensions) and Step 3 (dump).
- **B. `from-cf <file>` / `from-cfe <file>` / `from-dt <file>`** — a template file. Go to Step 1B. Do **not** treat this as a dump from an already existing infobase.

## Step 1B. Opt-in: new file infobase and source dump

Ask **once**, before any catalog/name questions:

> Создать новую файловую базу из этого файла и выгрузить исходники в `src/`?

- **Нет** or silence — do **not** create an infobase, do **not** dump that file, do **not** touch the bases catalog. Continue with **ordinary `/init`** (standard mode: list of detected settings, wait for «Всё верно»). Write `.dev.env`, `src/{cf,cfe,epf,erf}`, `build/`, `docs/`, `.pi/1c` as `/init` does. Leave `INFOBASE_PATH` empty. Skip Steps 2–3. Skip the first snapshot commit of dumped sources. Then lab extras (Step 4) and report (Step 5) that the file was **not** loaded.
- **Да** — only then ask for the bases catalog and folder name. Do not create anything until the path list is confirmed.

### Path list (only after «да»)

- **Bases catalog** — parent directory that will contain the infobase folder. Propose the common parent of sibling `INFOBASE_PATH` values when those paths look like file infobases (`1Cv8.1CD` one level down). If siblings give nothing, ask with no default.
- **Folder name** — propose the source file name without extension and without a trailing `_YYYYMMDD` stamp. The user may change it.
- Full infobase path = `{catalog}/{name}`. If `{path}/1Cv8.1CD` already exists, **stop**. Do not overwrite.
- Show one list: catalog, name, full path, source file, where sources will go (`src/cf` for `.cf`/`.dt`, `src/cfe/<name>` for `.cfe`). Wait: «Всё верно» / поправить / отмена. Отмена — no IB, no dump; still finish ordinary `/init` if `.dev.env` is not written yet.

### After «Всё верно»

Use only `1c-metadata-manage` scripts (`db-create.ps1`, `db-load-cf.ps1`, then `/loadfrom1cbase`). Do not compose ad-hoc `1cv8` / `ibcmd` lines. `PLATFORM_PATH` must be set; if empty, ask once.

- **`.cf`** — `db-create.ps1 -UseTemplate <file.cf> -InfoBasePath <full path>`. Dump the main configuration to `src/cf`. Write `INFOBASE_KIND=file`, `INFOBASE_PATH`, `EXPORT_PATH=src/cf`.
- **`.dt`** — same `db-create` with the `.dt` template (base includes data). Dump the main configuration to `src/cf`. Same `.dev.env` keys as `.cf`.
- **`.cfe`** — `db-create.ps1` **without** `-UseTemplate` (empty file IB), then `db-load-cf.ps1 -Extension <name> -InputFile <file.cfe>` and update that extension. Dump to `src/cfe/<name>`. Write `EXTENSION_NAME`, `EXTENSION_NAMES`, `EXTENSIONS_PATH=src/cfe`. Never load a `.cfe` as the main configuration.

Do not run `v8unpack` only to learn the configuration name. After the dump, read `<Name>` in `Configuration.xml`. If it differs from the infobase folder name, say so and ask whether to rename the folder. Do not rename it yourself.

## Step 2. Extensions inventory (`EXTENSION_NAMES`)

Only when dumping (scenario A, or B after «да» and a `.cf`/`.dt` main configuration). Skip after «нет», and skip for a `.cfe`-only load except to persist the one extension name already chosen.

The effective snapshot is **main configuration (cf) + all its extensions (cfe)**. `EXTENSION_NAMES` (comma-separated, apply order) is the contract.

- If `EXTENSION_NAMES` is filled — use it.
- If empty for a main-configuration dump — ask once which extensions belong to the snapshot, or confirm there are none. Persist. Do **not** silently assume "none".
- Discovering extensions from the live base is allowed only with platform syntax first verified through the docs MCP (`docsearch`).

## Step 3. Dump the snapshot into the repository

Skip after «нет».

Run `/loadfrom1cbase` (`$PI_CODING_AGENT_DIR/prompts/loadfrom1cbase.md`) in **full-snapshot mode** (`/loadfrom1cbase all`) when dumping a main configuration: `{EXPORT_PATH}` (usually `src/cf`), then each name in `EXTENSION_NAMES` into `{EXTENSIONS_PATH}\<Name>\`. For a `.cfe`-only load, dump that extension into `src/cfe/<name>`. The dirty-working-tree guard applies.

On a dump error, show the log fragment and stop; do not proceed to git with a partial snapshot.

## Step 4. Git repository and the first commit

1. If the project directory is not a git repository — `git init` (ordinary `/init` / Apply may already have done this).
2. Ensure `.gitignore` covers at least `.dev.env` and `build/`. Extend, never overwrite. Create `docs/` and `docs/techtask/` if missing.
3. After a successful dump only: create the first snapshot commit (e.g. `init: 1C configuration sources (cf + cfe)`). If the repository **already had commits**, ask before committing. After «нет» there is no dump commit.

## Step 4b. Lab extras (before the final report)

Follow `rules-1c/core/project-init.md` lab extras: Vanessa / КД / Humanizer RU. Silence is No. Do not copy extra skill trees into the project. Do not re-run the empty-scaffold wizard if `/init` already applied it.

## Step 5. Final report

Report: scenario A or B; whether a new infobase was created or the file was skipped; infobase path if any; snapshot layout; `.dev.env` keys written; commit if any. Next steps after a dump: `/update1cbase all` / `/deploy-and-test`, `/restore-testbase`. After «нет»: `/init` is already done; a later `/initproject from-cf` can still create the base if the user wants it.
