# Upstream mapping

Source: `comol/ai_rules_1c`.

| Upstream | Pi 1C destination | Policy |
|---|---|---|
| `AGENTS.md` | `rules-1c/AGENTS-UPSTREAM.md` + managed context block | ADAPT paths |
| `LLM-RULES.md`, `USER-RULES.md`, `memory.md`, `.dev.env.example` | `rules-1c/upstream-*` (+ project `.dev.env.example` when absent) | PRESERVE + path adaptation |
| `content/agents/*.md` | `agents/*.md` | ADAPT; preserve all roles and `modelTier`; Pi tool names; remove source-host orchestration flags |
| `content/rules/**` | `rules-1c/rules/**` | ADAPT; drop `globs/category`; rewrite source-only paths |
| `content/standards/**` | `rules-1c/standards/**` | ADAPT paths |
| `content/skills/**` | Pi `skills/**` | ADAPT internal paths, otherwise preserve verbatim structure |
| `content/commands/*.md` | Pi `prompts/1c-*.md` | ADAPT; drop `argumentHint/allowedTools`; rewrite paths |
| `openspec/**` | `rules-1c/openspec-reference/**` | ADAPT/PRESERVE as SDD reference; operational OpenSpec remains project-scoped |
| `content/openspec-bundle/**` | `rules-1c/openspec-bundle-reference/**` | REFERENCE ONLY; other-tool snapshots are not activated; use official `openspec init --tools pi` |
| entire upstream repository | `pi-1c-agent-upstream/` | UNMODIFIED SNAPSHOT for traceability |
| `adapters/pi.yaml` | compatibility reference | Its no-subagents decision is intentionally superseded by Pi's official extension mechanism |

The installer maps directory trees, not an allowlist, so new upstream rules/skills/commands are not silently dropped. `doctor.mjs` compares upstream vs adapted agent counts and scans adapted content for unresolved source-only paths.

## Pi-native additions

These components are intentionally new rather than mappings from upstream:

| Pi 1C component | Purpose |
|---|---|
| `extensions/1c-mode/index.ts` | OpenCode-style primary PLAN / BUILD modes for vanilla Pi |
| `rules/core/modes.md` | Behavioral contract for the two modes |
| `extensions/1c-subagents/index.ts` PLAN guard | Prevent writer-subagent bypass while PLAN is active |
| session state `pi-1c-mode-state` | Persist current primary mode |

## v0.6.0 project initialization mapping

`.dev.env.example` remains an upstream-owned contract. `/init` parses the pinned adapted copy at runtime; `config/dev-env.schema.json` is a non-authoritative UX overlay for the 43 variables present at the pinned commit. `/doctor` fails project schema coverage if the pinned template and UX overlay diverge, preventing silent loss of newly-added upstream variables.


## v0.6.1 local project scaffold

The `cf/cfe/epf/erf` layout is a Pi project-onboarding layer around the upstream environment contract. It does not replace upstream rules. `EXPORT_PATH` maps to the main configuration root and `EXTENSIONS_PATH` maps to the extension root when the user accepts autodetected values.
