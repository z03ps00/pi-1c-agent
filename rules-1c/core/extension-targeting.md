# Extension targeting before propose / apply

Before creating, borrowing or editing any 1C object, resolve the **target container**. Do not start from the tool
you happen to hold (a fresh `openspec/changes/...`, a brand-new CFE, a random module).

## Required inputs (read before choosing)

1. `knowledge_1c` — project/configuration rules and facts for the subsystem, object or task.
2. Project policy: root `USER-RULES.md` (if it exists) and `.pi/1c/rules/project/*.json` (active project rules win).
3. `.dev.env`: `NEW_OBJECTS_IN`, `EXTENSION_NAME`, `EXTENSION_NAMES`, `EXTENSIONS_PATH`.

## Decision table

| Condition | Target |
|---|---|
| `NEW_OBJECTS_IN=main_configuration` | main configuration (`src/cf`) |
| `NEW_OBJECTS_IN=extension` and `EXTENSION_NAME` set | that extension under `EXTENSIONS_PATH` |
| `NEW_OBJECTS_IN=extension`, `EXTENSION_NAME` empty, exactly one extension present | that extension (fill `EXTENSION_NAME` at `/1c-init`) |
| `NEW_OBJECTS_IN=extension`, several extensions, no explicit user choice | ask once; never guess |
| user explicitly asked for "отдельное расширение" / "new extension <name>" | new CFE — explicit user intent only |

## Hard rules

- A **new extension is never created implicitly**: no OpenSpec proposal, plan, subagent or refactor may invent
  `<Something>_Fix` because an object "did not fit". An existing project extension policy wins.
- A modification task ("fix the form", "return `-8` to `К оплате`") targets the container that already holds the
  code. Verify with `src/cfe`/`src/cf` search before proposing a new artifact.
- `EXTENSION_NAME` stays as the single primary extension. Do not repurpose it for a second CFE.

## Reporting

State the resolved target explicitly, for example `Target: src/cfe/Авара (NEW_OBJECTS_IN=extension, EXTENSION_NAME=Авара)`.
If the inputs disagree (empty `EXTENSION_NAME` with several extensions, `USER-RULES.md` contradicts `.dev.env`),
surface the conflict instead of choosing silently.
