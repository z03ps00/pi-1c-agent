---
description: "[settings] Pin the 1C work path for this session — docs-fix, spec-authoring, analytics, quick-fix, full-cycle, or auto"
argument-hint: "docs-fix|spec-authoring|analytics|quick-fix|full-cycle|auto|status"
---

# /taskmode — work path for this session

`/taskmode` chooses the **work path** (what result this task produces). It is not `/mode`.

- `/mode ask|plan|build` is the Pi session (read-only, planning, or implementation). The package owns that command.
- `/taskmode` only selects `docs-fix`, `spec-authoring`, `analytics`, `quick-fix`, or `full-cycle`.
- `/sdlc` selects verification depth. `/uitests` selects UI checks. Neither is changed here.

The path is session-scoped. It is not written to `.dev.env`. `auto` clears the pin and returns to triage in `rules-1c/AGENTS-UPSTREAM.md`.

## Arguments

| Argument | Effect |
|---|---|
| `docs-fix` | Prose only. Check structure, links, and consistency. No BSL validators. |
| `spec-authoring` | OpenSpec requirements and plan. Confirm concrete 1C facts before they land in an artifact. Implementation stays a later apply. |
| `analytics` | Explain or compare. Do not change sources. |
| `quick-fix` | One local change: short plan, edit, applicable checks. |
| `full-cycle` | Requirements, implementation, result checks, review, definition of done. |
| `auto` | Drop the pin. Choose the path by triage. |
| `status` | Report the pinned path, or `auto` when nothing is pinned. |
| empty | Same as `status`. |

## Gates this command does not waive

State the pin in one line, then apply triage from `rules-1c/AGENTS-UPSTREAM.md` and `rules-1c/rules/verification-policy.md`.

- Promotion triggers still raise the work to full-cycle: posting, transactions, a public `Экспорт` contract, wired metadata, an adopted extension object, rights or RLS, event subscriptions, scheduled jobs.
- A smaller pin does not authorize that work to stay a quick-fix.
- `syntaxcheck` of changed BSL stays mandatory at every `/sdlc` level.
- Metadata mutations still go through `1c-metadata-manage`. Infobase operations still go through the matching command.

If the pin conflicts with a trigger, say so and follow the trigger.

## Reply

In Russian, in three lines: the path now in effect, that `/mode` is unchanged, and that promotion triggers and `syntaxcheck` still apply.
