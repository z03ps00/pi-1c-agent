# `C:/DevopsMoments/pi-agents/config-1c/rules-1c/standards/` — bodies of the routed rules

This directory is the **authoring home of the fourteen detailed 1C standards** whose files in `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/` carry headings without bodies. It is the source the `1c-standards` collection of the Help MCP server (`1C-docs-mcp`) is built from, and it is the only place those rules are edited.

It exists because the alternative did not work: when the bodies were removed from `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/` and the corpus was pinned to the last commit that still had them, the normative text of the ruleset had no editable copy anywhere. A fix could not be written, reviewed, or diffed — only re-applied to a frozen commit.

## Not installed

`install.ps1` enumerates exactly four content directories — `content/rules`, `content/agents`, `content/commands`, `content/skills`. This one is deliberately not among them: user projects get the thin routers and retrieve the text, which is the whole point of the split. Adding it to the installer would undo the refactor.

## The sync contract

The corpus is built from this directory:

```
url:    https://github.com/comol/ai_rules_1c
prefix: content/standards
```

`prefix` is the part that matters. The lock shipped with the collection recorded `content/rules` — the directory whose bodies were then removed, so a re-sync from a later commit would have indexed fourteen routers and emptied the corpus of the text they route to. Pointing the prefix here removes that trap: `content/standards` holds bodies at every commit, so a sync from `HEAD` is always correct and the pin stops being load-bearing.

Documents resolve by file stem, so `standards(name="anti-patterns")` is unaffected by the move; only the `doc_id` changes (`1c-standards/C:/DevopsMoments/pi-agents/config-1c/rules-1c/standards/anti-patterns.md`).

## What belongs here, and what does not

Here: a rule whose `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/` file is a router — the fourteen listed below.

Not here: any rule that is inlined in `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/`. Those are read from context and need no retrieval; a second copy in this directory would be a duplicate to keep in sync, which is exactly the failure this directory exists to end. **One rule, one body, one location.**

| Routed standard | Router |
|---|---|
| `anti-patterns.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/anti-patterns.md` |
| `async-methods.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/async-methods.md` |
| `bsp-access-rights.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/bsp-access-rights.md` |
| `dcs-advanced-composition.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/dcs-advanced-composition.md` |
| `dcs-design.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/dcs-design.md` |
| `dev-standards-architecture.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/dev-standards-architecture.md` |
| `dev-standards-code-style.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/dev-standards-code-style.md` |
| `extension-patterns.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/extension-patterns.md` |
| `form-patterns.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/form-patterns.md` |
| `locks-and-transactions.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/locks-and-transactions.md` |
| `logging-strategy.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/logging-strategy.md` |
| `platform-solutions.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/platform-solutions.md` |
| `registers-design.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/registers-design.md` |
| `systematic-debugging.md` | `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/systematic-debugging.md` |

## Editing a standard

1. Edit the file **here**. The router in `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/` is not the text — editing it changes nothing an agent reads.
2. Keep every `##` / `###` / `####` heading in sync with its router. The routers reproduce the heading tree so that existing `<file>.md §N → "Title"` references and anchor links still resolve; a heading added here and not there is a reference that will not resolve, and one removed here leaves the router pointing at nothing. `tools/validate-rules.ps1` checks the pair.
3. Re-index the collection from this directory. Until it is re-indexed, agents retrieve the previous text — the edit is not live when it is merged, it is live when the corpus is rebuilt.

Retrieval side of the contract — `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/help-corpus-retrieval.md`.
