---
name: context-router
description: Route a task to shared memory (Cognee), knowledge/document retrieval (OpenViking), current project files, or a combination of them before the agent makes assumptions.
---

# Context Router

## Purpose

Choose the minimum set of context sources needed for a task.

## Routing rules

Use **current project files** when the answer depends on current code, configuration, branch state, file contents, runtime state, or generated artifacts.

Use **Cognee/shared-memory** (`memory` on `127.0.0.1:8001`, dataset `main_dataset`) when the task refers to or may depend on:
- previous decisions;
- prior fixes or errors;
- preferences or stable workflow choices;
- project history;
- constraints agreed earlier;
- prior session state;
- cross-agent context.

Use **OpenViking/knowledge-retrieval** when the task depends on:
- documentation;
- requirements/specifications;
- architecture descriptions;
- AGENTS.md or Skills;
- Markdown/reference material;
- indexed project knowledge.

Use a **combination** when both history and authoritative documentation/current files matter.

## Source precedence

When sources disagree:
1. Current project files/configuration/runtime evidence.
2. Current documentation/requirements.
3. Latest confirmed memory.
4. Older memory/history.
5. Model assumptions.

Never allow remembered state to override current code/config without evidence.

## Execution

1. Classify the task.
2. Select only relevant sources.
3. Invoke the corresponding skill(s).
4. Continue with the task using retrieved evidence.
5. If no MCP/tool exists, do not fabricate a result; state the limitation.

## Status line

Every substantial task ends with exactly one line:

`Memory: recalled N / nothing relevant; saved N / UNCONFIRMED / nothing to save`

Anonymous sessions: `Memory: skipped — anonymous`. Do not invent a second phrasing.
