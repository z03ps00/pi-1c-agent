# Detailed 1C project initialization

`/1c-init` is the canonical project-onboarding flow for `pi-1c-agent`.

## Source of truth

The environment variable list comes from the **pinned upstream** `ai_rules_1c/.dev.env.example`. The package's `config/dev-env.schema.json` is only a UX metadata overlay (titles, explanations, choices, sensitivity, dependency hints). It must not silently invent, drop, or rename upstream variables.

`/1c-init advanced` reviews every variable discovered in the upstream template. When upstream and UX schema drift, initialization must warn before proceeding and `/1c-doctor` must surface the mismatch.

## Mutation boundary

Project initialization is a BUILD operation because it writes project state. Before final confirmation the wizard must not mutate project files. It first collects answers, shows a redacted preview, and asks for explicit Apply.

Written state:

- `.dev.env` — local runtime values; mode `0600` on POSIX;
- `.gitignore` — ensures `.dev.env` is ignored;
- `.pi/1c/project.yaml` — non-secret project/configuration/capability summary;
- `.pi/1c/init-state.json` — non-secret initialization state;
- optional standard source scaffold under the selected layout root: `cf/`, `cfe/`, `epf/`, `erf/`;
- optional Configuration Knowledge fingerprint when explicitly enabled;
- optional OpenSpec CLI + native Pi artifacts (`openspec/`, `.pi/skills/openspec-*`, `.pi/prompts/opsx-*.md`) when explicitly enabled.

**Selected extras are installed on Apply, not deferred.** A Yes on OpenSpec (or Knowledge, or scaffold) materializes that dependency during Apply. Do not leave the user with a flag and a follow-up command. `/1c-openspec-setup` remains a repair/retry path if Apply's install failed.

## Install scope: agent global, project data only

The agent — adapted rules (`rules-1c/`), subagents (`agents/`), skills (`skills/`), prompts (`prompts/`) and the upstream snapshot (`pi-1c-agent-upstream/`) — belongs to the **global** Pi profile (`PI_CODING_AGENT_DIR`, installed with `tools/install.mjs --global`). Project initialization **must not** install the agent into the project.

Project-local, by contract:

- `.dev.env`, `.dev.env.example`;
- `.pi/1c/**` — `project.yaml`, `init-state.json`, `settings.json`, `knowledge/**`, `knowledge-drafts/**`, `rules/{configuration,project}/**.json`, `plans/**`, `logs/**`;
- `src/{cf,cfe,epf,erf}` and `build/{cf,cfe,epf,erf}` scaffold;
- `openspec/` plus its `.pi/skills/openspec-*` and `.pi/prompts/opsx-*.md`.

`tools/bootstrap.mjs --project` is **data-only** by default: it writes the project data above and retires any legacy project-local agent artifacts listed in the previous project manifest. `--with-agent` restores the legacy full project install and is used only on an explicit user request (offline or global-profile-less setups). `extensions/1c-subagents` resolves agents from the global profile first; project agents are an opt-in (`settings.json` `projectAgents: true`) superset, never a duplicate copy.

`/1c-doctor project` keeps agent-artifact checks on the global profile and reports a non-required WARN when duplicate project-local agent artifacts are present.

Secrets (`IB_PASSWORD`, `REPOSITORY_PASSWORD`, `SUPPORT_KEY`) never appear in preview, `project.yaml`, `init-state.json`, knowledge, handoffs, or reports. Production credentials must not be requested for `.dev.env`.

## Autodetection

Before asking, attempt read-only detection of:

- configuration name/version/source root from `Configuration.xml`;
- `PLATFORM_VERSION` from `CompatibilityMode`;
- latest installed `PLATFORM_PATH` from standard Windows/Linux locations;
- configuration source root for `EXPORT_PATH`;
- shared 1C source-layout root (for example `src` when `Configuration.xml` is under `src/cf`);
- layout-aware `EXTENSIONS_PATH` proposal (for example `src/cfe`).

Autodetected values are proposals, not silent irreversible decisions.

## Modes

- `/1c-init` — lets the user choose detailed or quick mode; detailed is recommended.
- `/1c-init advanced` — reviews all upstream variables one by one with human explanations.
- `/1c-init quick` — asks key project decisions and keeps upstream defaults for the rest.
- `/1c-init status` — deterministic status/schema coverage report.

Defaulted/advisory values must be explained as defaults instead of being treated as mandatory input. Empty values that upstream defines as valid remain valid.

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
