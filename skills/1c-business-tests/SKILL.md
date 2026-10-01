---
name: 1c-business-tests
description: "Create, maintain and run reusable tests of 1C business logic using the project's verified framework or runner. Optional: the model chooses when persistent regression coverage adds value beyond a focused result check."
argument-hint: "<business behavior, regression or existing test>"
---

# 1c-business-tests — reusable business-logic checks

Save executable checks for calculations, query results and business behavior that merit repeated verification. The model decides whether to use this skill; a reported regression, important boundary condition or recurring calculation is a useful trigger. A one-off read-only comparison through Gate 3a may be enough for a small change. Do not make test-suite creation a mandatory full-cycle stage.

## Choose a verified execution path

Inspect the target project's tests, framework version, assertions, fixtures and run command. Reuse that framework and naming style. Confirm its actual API from project examples and authoritative documentation; never assume a module suffix, assertion signature, MCP tool or installed test extension from another repository.

If no suite exists, choose the smallest verified runner compatible with the task and available tooling. A callable MCP operation can help prepare or execute a check, but chat-only invocations are not a standalone runner. For a repeatable suite, save the case definitions plus a real project entry point or supported runner invocation. If none is available, identify the missing dependency and keep execution blocked; do not invent `run_unit_tests`, claim that a Markdown plan is an executable suite or install an extension silently.

Relevant project routing:

- `skills/1c-code-search/SKILL.md` and `skills/1c-meta-info/SKILL.md` — locate the implementation and confirm test data shapes in the correct project / extension.
- `skills/1c-platform-help/SKILL.md` — confirm platform / BSP behavior actually used by the test.
- `skills/1c-live-ib/SKILL.md` — exact exposed live-IB calls and their limits; Gate 3a remains read-only and does not become a fixture writer.
- `skills/1c-metadata-manage/SKILL.md` — any test module / metadata creation; installed test code is still subject to the ordinary metadata, repository and validation gates.

## Define the cases before implementing them

For each relevant acceptance criterion record:

- stable case ID, purpose and initial data;
- action / input and explicit expected values or error;
- target source / configuration state, required rights and execution context;
- whether the case is read-only or mutating, and who owns its fixtures.

Choose representative normal, empty / boundary and failure cases according to the changed behavior. Assertions must distinguish the reported defect from correct behavior: successful execution or a nonempty result alone seldom proves a calculation or set of movements. Compare the relevant values, composition and counts against independently derived expectations. Test behavior through the intended contract instead of reproducing the implementation inside the assertion.

## Author and execute

1. Save tests using the existing framework conventions. Preserve deterministic inputs; avoid dependence on today's date, test order or arbitrary records from the database. Keep dataset size bounded to the behavior under test.
2. Route saved BSL and metadata through the applicable gates in `rules-1c/rules/verification-policy.md` and `rules-1c/rules/verification-gates.md` before loading or running it. Tests do not exempt generated code from validation.
3. Verify the target is an authorized dev/test infobase and matches the relevant sources / extension. Loading test modules or applying a test extension uses the existing infobase workflow, with one deployment owner. Framework availability alone does not authorize a deployment.
4. For mutating scenarios, establish the authorized objects/actions, isolated fixtures, ownership identifiers and cleanup/recovery plan before execution. Existing authorization is reusable; do not ask twice. Do not run on production, alter shared reference data or assume that a transaction rollback reverses every side effect. Read-only tests must remain read-only, including their setup and teardown.
5. Run the selected cases through the verified runner. Preserve its failure status; setup/teardown errors and zero discovered cases are failures or explicit blocked states, never passes. Capture case ID, expected/actual comparison, source/deployed state and report/log location without credentials or personal data.
6. Clean up only data owned by this run through the authorized project mechanism, including after failures. Report incomplete cleanup separately without replacing the original test failure. An installed test module / extension is not silently removed or left enabled: follow the agreed lifecycle for this target.

`UI_TESTING` controls browser checks, not these server-side tests. Tool policy, infobase authorization and test-fixture boundaries still apply. A technical user's successful test does not establish another user's rights; an access-control scenario needs the intended verified identity.

## Delivery

Provide the saved test files, verified framework/runner and exact run command, covered criteria and prerequisites. Separate `authored`, `executed: passed`, `executed: failed` and `blocked/unverified`; list fixture cleanup status when relevant. Static validation is not a runtime pass.

When a check fails, preserve its expectation unless evidence shows the specification itself needs clarification. Fix the in-scope cause and confirm affected checks within the existing verification budget. Do not turn skill selection into an unlimited test/fix loop. For saved browser scenarios use `skills/1c-ui-regression/SKILL.md`.
