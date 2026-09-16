# Detailed 1C project initialization

`/init` is the canonical project-onboarding flow for `pi-1c-agent`. `/init` is an alias for one release. The first interactive question is empty source scaffold vs dump from an existing infobase / `.cf` / `.dt`.

## Source of truth

The environment variable list comes from the **pinned upstream** `ai_rules_1c/.dev.env.example`. The package's `config/dev-env.schema.json` is only a UX metadata overlay (titles, explanations, choices, sensitivity, dependency hints). It must not silently invent, drop, or rename upstream variables.

`/init advanced` reviews every variable discovered in the upstream template. When upstream and UX schema drift, initialization must warn before proceeding and `/doctor` must surface the mismatch.

## Mutation boundary

Project initialization is a BUILD operation because it writes project state. Before final confirmation the wizard must not mutate project files. It first collects answers, shows a redacted preview, and asks for explicit Apply.

Written state:

- `.dev.env` — local runtime values; mode `0600` on POSIX;
- `.gitignore` — ensures `.dev.env` and `build/` are ignored (`docs/` is tracked);
- `.pi/1c/project.yaml` — non-secret project/configuration/capability summary;
- `.pi/1c/init-state.json` — non-secret initialization state;
- `.pi/1c/{knowledge,knowledge-drafts,rules}` — project knowledge dirs (always; the agent is not copied);
- optional standard source scaffold under the selected layout root: `cf/`, `cfe/`, `epf/`, `erf/`;
- optional compiled-artifact scaffold `build/{cf,cfe,epf,erf}` (binaries named `OriginalName_YYYYMMDD`);
- optional `docs/` and `docs/techtask/` for documentation and raw agent TZs;
- optional Configuration Knowledge fingerprint when explicitly enabled.

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

Before asking `.dev.env` variables, scan **one directory up** for sibling 1C projects and propose shared non-secret values (`PREFIX`, `COMPANY`, `DEVELOPER`, `PLATFORM_PATH`, …) with source names. The user accepts the set, names corrections, or skips neighbors. Remaining variables are asked one by one. Autofill is allowed only as a proposal; Apply still requires explicit confirmation. Secrets and project-specific IB/export paths are never copied from siblings.

## Modes

- `/init` — first question: empty scaffold vs dump from IB / `.cf` / `.dt`; then detailed or quick mode; detailed is recommended.
- `/init advanced` — empty-scaffold path; reviews all upstream variables one by one with human explanations.
- `/init quick` — key project decisions and upstream defaults for the rest.
- `/init status` — deterministic status/schema coverage report.
- `/init knowledge` — plant only `.pi/1c` knowledge dirs into an existing 1C repo (no agent copy, no `.dev.env` wizard, no OpenSpec). Cursor procedure: `/init-knowledge`.
- `/init` — alias of `/init` for one release.

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

## Compiled artifacts (`build/`)

Sibling of `src/`. Same kind folders: `build/cf`, `build/cfe`, `build/epf`, `build/erf`. Holds compiled `.cf` / `.cfe` / `.epf` / `.erf`. File names are `OriginalName_YYYYMMDD`; if that file exists, `OriginalName_YYYYMMDD-HHmmss`. `build/` is gitignored.

## Documentation (`docs/`)

- `docs/` — project documentation that should live in git.
- `docs/techtask/` — raw technical assignments for the agent (drafts, informal specs). Do not put secrets there.
