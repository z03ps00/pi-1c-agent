# Verification — v0.6.0

Release verification for the detailed project-initialization release.

## Automated tests

- Fast suite: **38/38 PASS**.
- Full suite: **39/39 PASS**.
- Synthetic bootstrap still covers all **13 upstream agent roles**.
- Package doctor: **CORE: PASS**.

New v0.6.0 coverage includes:

- UX schema contains exactly 43 unique pinned `.dev.env.example` variable names;
- upstream/schema drift is detected rather than silently ignored;
- template parsing/rendering preserves the upstream template structure;
- re-initialization preserves extra local ENV variables not owned by upstream;
- secret values are redacted from summaries;
- `.dev.env` contains secrets locally while `project.yaml` and `init-state.json` do not;
- `.dev.env` is added to `.gitignore` and gets `0600` on POSIX;
- Configuration.xml autodetection extracts source root, configuration name/version and CompatibilityMode;
- project init package/extension contract is registered.

## TypeScript entrypoints

All five extension entrypoints were syntax/transpile parsed with TypeScript `--noCheck` without diagnostics:

- `extensions/1c-mode/index.ts`
- `extensions/1c-subagents/index.ts`
- `extensions/1c-admin/index.ts`
- `extensions/1c-knowledge/index.ts`
- `extensions/1c-init/index.ts`

## Security invariants

- `/1c-init` requires a trusted project and BUILD mode.
- Before the final Apply confirmation, initialization answers are held in memory; the init flow does not write `.dev.env` or init manifests.
- If prerequisite bootstrap is missing, it has its own explicit confirmation because bootstrap itself writes project rules/resources.
- `IB_PASSWORD`, `REPOSITORY_PASSWORD`, and `SUPPORT_KEY` are not written to `project.yaml`, `init-state.json`, knowledge, handoffs, preview, or reports.
- Pi text input does not promise password masking, so the wizard explicitly warns before secret entry and allows deferring local secret entry.

## Upstream pin

`comol/ai_rules_1c` remains pinned to:

`8901177ef92b611537fe79a4e4dfe19c600d9cc8`

The complete upstream snapshot is fetched during bootstrap rather than redistributed in this ZIP.
