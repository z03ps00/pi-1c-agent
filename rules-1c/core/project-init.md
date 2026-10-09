# Detailed 1C project initialization

`/init` is the canonical project-onboarding flow for `pi-1c-agent`. Empty `/init` opens the overlay: empty source scaffold vs existing infobase vs `.cf` / `.cfe` / `.dt`; then Standard / Quick / Detailed.

## Source of truth

The environment variable list comes from the **pinned upstream** `ai_rules_1c/.dev.env.example`. The package's `config/dev-env.schema.json` is only a UX metadata overlay (titles, explanations, choices, sensitivity, dependency hints). It must not silently invent, drop, or rename upstream variables.

`/init advanced` reviews every variable discovered in the upstream template. When upstream and UX schema drift, initialization must warn before proceeding and `/doctor` must surface the mismatch.

## Mutation boundary

Project initialization is a BUILD operation because it writes project state. Before final confirmation the wizard must not mutate project files. It first collects answers, shows a redacted preview, and asks for explicit Apply.

Written state:

- `.dev.env` — local runtime values; mode `0600` on POSIX;
- `.gitignore` — ensures `.dev.env` is ignored;
- `.pi/1c/project.yaml` — non-secret project/configuration/capability summary;
- `.pi/1c/init-state.json` — non-secret initialization state;
- `.pi/1c/{knowledge,knowledge-drafts,rules}` — project knowledge dirs (always; the agent is not copied);
- `.pi/mcp.json` — empty project MCP template when the file is missing; an existing file is left untouched. Tokens do not belong here. Pi reads this file; a server name here overrides the same name in the profile `mcp.json`;
- optional standard source scaffold under the selected layout root: `cf/`, `cfe/`, `epf/`, `erf/`;
- optional Configuration Knowledge fingerprint when explicitly enabled;
- optional OpenSpec CLI + native Pi artifacts (`openspec/`, `.pi/skills/openspec-*`, `.pi/prompts/opsx-*.md`) when explicitly enabled;
- optional Vanessa project dirs (`tests/features/` and companions) and/or `VANESSA_MCP_URL` when Vanessa extra is Yes;
- optional `tools/mcp-toolkit/` and KD port keys when KD extra is not none;
- optional Humanizer RU auto-use flag in `.pi/1c/project.yaml` when Humanizer extra is Yes.

**Selected extras are installed on Apply, not deferred.** A Yes on OpenSpec (or Knowledge, or scaffold) materializes that dependency during Apply. Do not leave the user with a flag and a follow-up command. `/openspec-setup` remains a repair/retry path if Apply's install failed.

Lab extras (Vanessa, Конвертация данных, Humanizer RU) are **not** `ai_rules_1c`. `/init` must ask them; silence is not Yes. Apply writes only project data:

- Vanessa=yes → `tests/features/` (and companion `tests/fixtures/`, `tests/reports/`, `tests/screenshots/`); `VANESSA_MCP_URL` only if supplied. No skill copy. No EPF/CFE unless binaries were confirmed in this run. Vanessa MCP fragment only after an explicit URL (`/install-vanessa-mcp`).
- KD ≠ none → `tools/mcp-toolkit/` plus missing `MCP_TOOLKIT_PORT` / `KD2_PORT` / `KD31_PORT` from `$PI_CODING_AGENT_DIR/dev.env.lab-extras.example`. No skill copy. No `MCP_Toolkit.epf` download unless confirmed. Toolkit is never an MCP server.
- Humanizer=yes → auto-use preference in `.pi/1c/project.yaml` only. No skill copy. No Python linter unless asked.
- Vanessa=no / KD=none / Humanizer=no → do not create those dirs, keys, or auto-use flag.

Do **not** add extra keys to the pinned `ai_rules_1c` `.dev.env.example`. Declined extras can be enabled later (settings / extras re-ask / first-use consent) without a full re-init. Skills remain in `$PI_CODING_AGENT_DIR/skills/`. Explicit «очеловечь» still loads profile `humanizer-ru` after decline.

## Install scope: agent global, project data only

The agent — adapted rules (`rules-1c/`), subagents (`agents/`), skills (`skills/`), prompts (`prompts/`) and the upstream snapshot (`pi-1c-agent-upstream/`) — belongs to the **global** Pi profile (`PI_CODING_AGENT_DIR`, installed with `tools/install.mjs --global`). Project initialization **must not** install the agent into the project.

Project-local, by contract:

- `.dev.env`, `.dev.env.example`;
- `.pi/1c/**` — `project.yaml`, `init-state.json`, `settings.json`, `knowledge/**`, `knowledge-drafts/**`, `rules/{configuration,project}/**.json`, `plans/**`, `logs/**`;
- `src/{cf,cfe,epf,erf}` and `build/{cf,cfe,epf,erf}` scaffold;
- `openspec/` plus its `.pi/skills/openspec-*` and `.pi/prompts/opsx-*.md`.

`tools/bootstrap.mjs --project` is **data-only** by default: it writes the project data above and retires any legacy project-local agent artifacts listed in the previous project manifest. `--with-agent` restores the legacy full project install and is used only on an explicit user request (offline or global-profile-less setups). `extensions/1c-subagents` resolves agents from the global profile first; project agents are an opt-in (`settings.json` `projectAgents: true`) superset, never a duplicate copy.

`/doctor project` keeps agent-artifact checks on the global profile and reports a non-required WARN when duplicate project-local agent artifacts are present.

Secrets (`IB_PASSWORD`, `REPOSITORY_PASSWORD`, `SUPPORT_KEY`) never appear in preview, `project.yaml`, `init-state.json`, knowledge, handoffs, or reports. Production credentials must not be requested for `.dev.env`.

## Autodetection

Before asking, attempt read-only detection of:

- configuration name/version/source root from `Configuration.xml`;
- `PLATFORM_VERSION` from `CompatibilityMode`;
- `PLATFORM_PATH` from sibling 1C projects when that directory exists, otherwise the latest installed platform;
- configuration source root for `EXPORT_PATH`;
- shared 1C source-layout root (for example `src` when `Configuration.xml` is under `src/cf`);
- layout-aware `EXTENSIONS_PATH` proposal (for example `src/cfe`);
- shared non-secret `.dev.env` values from sibling 1C projects one directory up.

Autodetected values are proposals, not silent irreversible decisions.

## Modes

- `/init` — empty call opens the overlay: empty scaffold vs existing IB vs `.cf` / `.cfe` / `.dt`; then Standard (recommended), Quick, or Detailed. Named arguments skip the picker.
- `/init standard` — empty-scaffold path; agent fills shared settings from siblings and autodetection, shows one list, waits for edits and «Всё верно», then writes. No second Apply question.
- `/init advanced` — empty-scaffold path; reviews all upstream variables one by one with human explanations.
- `/init quick` — key project decisions and upstream defaults for the rest.
- `/init status` — deterministic status/schema coverage report.
- `/init knowledge` — plant only `.pi/1c` knowledge dirs into an existing 1C repo (no agent copy, no `.dev.env` wizard, no OpenSpec). Cursor procedure: `/init-knowledge`.

Defaulted/advisory values must be explained as defaults instead of being treated as mandatory input. Empty values that upstream defines as valid remain valid.

## Standard mode

Standard init does **not** ask every `.dev.env` variable. It builds a profile, shows a redacted list (name, value, origin), and writes nothing until the developer confirms «Всё верно».

Fill order per field:

1. Non-empty value already in this project's `.dev.env`.
2. Majority shared non-secret value from sibling 1C projects one directory up. If neighbors disagree, the list shows the chosen value and the alternatives.
3. Local autodetection (`Configuration.xml`, installed platform, `src` layout).
4. Upstream default from `.dev.env.example`.

`PLATFORM_PATH` uses a sibling path only when that directory exists on disk; otherwise the newest installed platform. Infobase path, user/password, extension names, publish URL, repository credentials, and other secrets are never copied from neighbors.

Default-on: `src/{cf,cfe,epf,erf}`, `build/{cf,cfe,epf,erf}`, `docs/` and `docs/techtask/`. Configuration Knowledge fingerprint is on only when configuration name and version are already known. OpenSpec is off.

After the list:

- **Всё верно** — the confirmation; then Apply.
- **Поправить** — edit one row, show the list again, wait for «Всё верно».
- **Отмена** — no writes.

`init-state.json` records `initMode: standard`.

**Cursor:** there is no Pi TUI. Print the same list and do not write `.dev.env` / manifests until the developer explicitly confirms that the list is correct.

## Standard source scaffold

The initializer distinguishes two paths:

- **configuration source root** — where the main `Configuration.xml` / main configuration dump lives, usually `src/cf`;
- **source-layout root** — common parent for project artifacts, usually `src`.

When enabled, final Apply creates only missing directories:

- `<layout>/cf` — main configuration;
- `<layout>/cfe` — configuration extensions;
- `<layout>/epf` — external data processors;
- `<layout>/erf` — external reports.

Never delete, clear, rename, or overwrite existing content while creating the scaffold. The layout root must resolve inside the trusted project directory. No `.gitkeep` is created inside 1C source directories because unknown marker files may interfere with external tooling; empty directories are therefore local filesystem scaffold until they contain real project artifacts.
