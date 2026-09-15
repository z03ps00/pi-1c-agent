# Adaptation audit contract

This package treats `comol/ai_rules_1c` as upstream source content and vanilla Pi as the target runtime.

## Mandatory mappings

- Root `AGENTS.md` -> adapted `rules-1c/AGENTS-UPSTREAM.md` plus a Pi-native managed block.
- `content/rules/**` -> `rules-1c/rules/**`; remove Pi-unsupported frontmatter keys `globs`, `category`; rewrite source-only paths.
- `content/standards/**` -> `rules-1c/standards/**`; rewrite source-only paths.
- `content/skills/**` -> Pi `skills/**`; preserve skill structure and rewrite source-only paths.
- `content/commands/*.md` -> Pi `prompts/1c-*.md`; remove `argumentHint`, `allowedTools`; rewrite source-only paths.
- `openspec/**` -> `rules-1c/openspec-reference/**` as adapted upstream SDD reference; operational project state remains project-scoped.
- `content/openspec-bundle/**` -> `rules-1c/openspec-bundle-reference/**` for traceability only; do not activate non-Pi tool bundles. Active Pi OpenSpec artifacts come from official `openspec init --tools pi`.
- `content/agents/*.md` -> Pi subagent definitions in `agents/*.md`; preserve every upstream role; map tools to Pi names; preserve `modelTier`; remove only source-host orchestration flags (`isSubagent`, `allowParallel`).

## Hard doctor gates

`doctor.mjs` must fail CORE when:

1. adapted subagent count differs from upstream;
2. a source-only `content/rules|standards|skills|agents|commands/` reference remains in installed adapted content;
3. Pi-incompatible frontmatter remains in rules/prompts;
4. an upstream `modelTier` was lost;
5. core trees or upstream snapshot are missing;
6. upstream contains OpenSpec material but the adapted reference trees are missing.

When `--require-openspec` is requested, doctor must also fail unless OpenSpec CLI and project-local native Pi artifacts exist.

The untouched upstream snapshot is kept separately for traceability and is excluded from residue checks.

## Capability boundary

The package adapts **rules, prompts, skills and agent decomposition**. Upstream rules that expect external 1C MCP services still require those services (or a Pi MCP bridge) to be configured. The subagent extension does not pretend an unavailable MCP tool exists; the original `MCP` pseudo-tool is therefore not added to a child's `--tools` list.

## Pi-native PLAN / BUILD layer

This package adds a target-runtime layer that does not come from upstream `ai_rules_1c`:

- `extensions/1c-mode/index.ts` implements primary `PLAN` and `BUILD` modes.
- `PLAN` removes built-in `edit`, `write`, and `bash`, blocks mutating tool calls by name, and keeps `subagent_1c` available only under the subagent guard.
- `extensions/1c-subagents/index.ts` enforces PLAN at the delegation boundary: only read-only/planning roles may run, and child Pi processes receive `--1c-mode plan` plus read-only tools (`read,grep,find,ls`).
- `BUILD` restores the tool set captured at session start and permits the full upstream role set.
- Mode state is persisted in the Pi session and displayed in the TUI.

The doctor treats the mode extension, subagent extension, and installed `modes.md` rule as CORE requirements.
