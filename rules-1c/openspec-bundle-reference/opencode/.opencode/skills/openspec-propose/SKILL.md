---
name: openspec-propose
description: Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.2.0"
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

When ready to implement, run /opsx-apply

## Question-asking discipline (read first)

The propose phase is where every clarifiable architectural decision **must** be settled. Apply phase is not the time for clarifications — by the time code is being written, the user must not be paying a clarification tax that should have been paid here.

- **Ask the user now, do not defer to apply.** The upstream OpenSpec default "prefer making reasonable decisions to keep momentum" is **overridden** for this project. If a decision is architecturally meaningful and ambiguous (placement / provider / data scope / settings storage / key handling / transactional boundaries / error-handling pattern / logging strategy / library / БСП subsystem / platform-version target / public common-module signatures), ask the user **here**, not at apply time.
- **Do not ask the user about facts an MCP call could close.** Names, attributes, tabular sections, БСП subsystem availability, platform-API signatures — resolve via `recall` / `resolve_qualified_name` / `search_metadata` / `ssl_search` / `docinfo` before reaching for `AskUserQuestion`.
- **Pin defaults the user is unlikely to care about with a one-line rationale in `design.md` and move on.** Do not ask about cache-eviction policy, private helper names, internal module splits when no NFR or convention exists.
- **The full rule lives in `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/sdd-integrations.md → Propose-phase clarification discipline`. Load it before authoring any non-trivial proposal.**

Forbidden in finalized artifacts (each is a propose-phase defect of the same severity as a missing `Context sources` block):

- "TODO: clarify with the user during apply" / "уточнить при реализации" — every such marker is an admission that this phase failed. Either decide now with the user, or capture as a numbered item in `design.md → ## Open Questions` with the exact future question, the artifact section it will update, and the dependent task ID — **and only if** the answer genuinely depends on facts that surface later, not on a user decision you skipped asking.
- "We'll decide once we see the code" / "будем смотреть по ходу" — almost never legitimate.
- Vague verbs in delta `### Requirement:` blocks: "appropriately", "if needed", "as required", "по необходимости", "при необходимости".
- Phantom defaults — two equally weighted options listed without a written rationale for the default.

---

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**
   ```bash
   openspec new change "<name>"
   ```
   This creates a scaffolded change at `openspec/changes/<name>/` with `.openspec.yaml`.

3. **Get the artifact build order**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to get:
   - `applyRequires`: array of artifact IDs needed before implementation (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts with their status and dependencies

4. **Create artifacts in sequence until apply-ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:
      - Get instructions:
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - The instructions JSON includes:
        - `context`: Project background (constraints for you - do NOT include in output)
        - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
        - `template`: The structure to use for your output file
        - `instruction`: Schema-specific guidance for this artifact type
        - `outputPath`: Where to write the artifact
        - `dependencies`: Completed artifacts to read for context
      - Read any completed dependency files for context
      - Create the artifact file using `template` as the structure
      - Apply `context` and `rules` as constraints - but do NOT copy them into the file
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until all `applyRequires` artifacts are complete**
      - After creating each artifact, re-run `openspec status --change "<name>" --json`
      - Check if every artifact ID in `applyRequires` has `status: "done"` in the artifacts array
      - Stop when all `applyRequires` artifacts are done

   c. **If an artifact requires user input** (unclear context):
      - Use **AskUserQuestion tool** to clarify **now**, not later. Apply phase will not get a second chance to ask routine architectural / scope / naming questions.
      - Then continue with creation

5. **Pre-finalization clarification gate**

   **Before** declaring "All artifacts created! Ready for implementation.", run a final consolidation pass:

   a. **Re-read every `### Requirement:`** in delta `specs/` and every decision in `design.md`. For each one: can the implementer execute the code that satisfies this requirement / decision from the artifacts alone, without a follow-up question to the user? Any "no" → add to a single batched question list.

   b. **Re-read `proposal.md → Constraints` / `Out of scope` / `Non-goals`.** For each scope edge: is the wording sharp enough that an implementer cannot accidentally cross it? Sharpen now, or batch a clarification.

   c. **Re-read `tasks.md`.** Each task should be executable from the current artifacts alone. Tasks like "implement reasonable defaults" or "decide between approaches" indicate the gate is not yet passed — settle the choice in `design.md`, then re-write the task.

   d. **Audit `design.md → ## Open Questions`.** Each entry is a promise that the user will be asked again at apply time. Allowed only if the answer genuinely depends on facts that surface later (production data, performance measurements, a not-yet-implemented module's actual shape). "I forgot to ask" / "user wasn't sure yet" / "let's see what apply finds" — **not** legitimate. Either close the question now (with a `CONFUSION` block to the user) or remove it.

   e. **If the batched question list is non-empty** — present it to the user in **one** consolidated `AskUserQuestion` round (open-ended for free-text answers, preset options where applicable). Apply the answers to the artifacts. Then re-run the gate. Repeat until the batched list is empty.

   The proposal is "ready" only when this gate passes: empty batched list, every artifact internally consistent, `## Open Questions` contains only items that legitimately depend on later facts.

6. **Show final status**
   ```bash
   openspec status --change "<name>"
   ```

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx-apply` or ask me to implement to start working on the tasks."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openspec instructions` for each artifact type
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**Guardrails**
- Create ALL artifacts needed for implementation (as defined by schema's `apply.requires`)
- Always read dependency artifacts before creating a new one
- **Ask the user about every ambiguous architectural / scope / naming / placement / storage / library / БСП / transactional decision during this phase — do NOT defer to apply.** "Prefer making reasonable decisions to keep momentum" is **not** the rule for this project; the rule is in `C:/DevopsMoments/pi-agents/config-1c/rules-1c/rules/sdd-integrations.md → Propose-phase clarification discipline`.
- Resolve facts the project already knows (`recall`) or that an MCP call can close (`resolve_qualified_name`, `search_metadata`, `ssl_search`, `docinfo`) **before** reaching for `AskUserQuestion`.
- **The pre-finalization clarification gate (step 5) is non-negotiable.** Declaring "Ready for implementation" with `TODO: clarify during apply` markers, vague requirement verbs ("appropriately", "if needed"), or `## Open Questions` items that the user could have answered now is a propose-phase defect.
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
