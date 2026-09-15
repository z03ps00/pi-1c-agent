# Verification — v0.4.0

Performed before packaging:

- `package.json` version and Pi extension manifest validated.
- Node syntax checks passed for installer/doctor/OpenSpec scripts.
- TypeScript extensions passed `tsc --noEmit` against API/type stubs for syntax/type-shape sanity.
- Runtime mock test passed:
  - default primary mode is BUILD;
  - switching to PLAN removes `bash`, `edit`, `write`;
  - PLAN blocks a mutating custom tool by name;
  - PLAN blocks `1c-developer` before subprocess launch;
  - PLAN allows `1c-explorer` and child Pi receives `--1c-mode plan` + `read,grep,find,ls` only;
  - switching to BUILD restores writer tools;
  - BUILD allows `1c-developer` and child Pi receives `--1c-mode build`.
- Synthetic upstream install passed with all 13 roles, deliberately incompatible rule/prompt frontmatter and source-only paths; doctor ended with `CORE: PASS`.
- OpenSpec remained optional in the synthetic environment, as expected when the CLI/project artifacts are absent.

Runtime against a real user-installed Pi + real 1C project is still environment-dependent and should be confirmed after installation with `/1c-doctor` and a PLAN/BUILD smoke test.
