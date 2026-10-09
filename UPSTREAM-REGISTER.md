# Profile update register (comol/ai_rules_1c)

Append-only. Each applied `/review-airules` plan adds a new dated section. Do not rewrite history. Acknowledge-and-skip still appends a section (items marked skip) and advances the pin in `upstream.lock.json`.

Review is `/review-airules` (read-only). Apply is a later `/opsx-apply` or `/execute-plan`. Never run upstream `install.ps1` against this profile tree.

**Before porting anything, read `prompts/review-airules.md → Apply discipline`.** It is the hard-won checklist: adapt or skip Pi forks (never wholesale-replace), new upstream commands land as new files, keep compatibility routers with inbound references, leave no dangling links, record facts only (and never name a lab extra), respect the relative-vs-`$PI_CODING_AGENT_DIR` path split, and verify (`tests/run-all.mjs` + `openspec validate --strict`) before advancing the pin.

## Baseline

- **Date:** 2026-09-14
- **Source:** https://github.com/comol/ai_rules_1c
- **From-SHA:** (none — first pin)
- **To-SHA:** `410951e74fd3e6b7a763cf49757935b9a34d3f31`
- **Items:** existing `rules-1c/`, `skills/`, `prompts/`, `agents/` snapshot as adapted for Pi
- **Action:** baseline pin (no copy in this APPLY)
- **Dependencies:** none added

## apply-airules-c1fb8e6

- **Date:** 2026-10-01
- **Source:** https://github.com/comol/ai_rules_1c
- **From-SHA:** `410951e74fd3e6b7a763cf49757935b9a34d3f31`
- **To-SHA:** `c1fb8e687be5b9d71d5a05c6f5d32cf6a6919dcb`
- **OpenSpec:** `openspec/changes/apply-airules-c1fb8e6`
- **Action:** adapt into the Pi profile (paths `rules-1c/rules/`, `skills/`, `prompts/`, `agents/1c-*.md`). No `install.ps1`.

### copy / adapt

- **Tier A.** Added `mcp-policy.md`, `subagent-core.md`, `multi-contour-search.md`. Updated `mcp-first-search.md`, `verification-policy.md`, `verification-gates.md`, `verification-delivery.md`. `verification-checklist.md` stays as the compatibility router into that trio (kept, not removed — the `openspec-bundle-reference/*` client bundles load it as the Stage 5 gate runner).
- **Tier B.** `1C-docs-mcp` is not in the default `mcp.json`. Routers were updated to upstream headings. Normative bodies stay in `rules-1c/standards/`. `help-corpus-retrieval.md` records that fallback.
- **Tier C.** Added operation skills `1c-code-search`, `1c-meta-info`, `1c-impact`, `1c-form-inspect`, `1c-validate`, `1c-platform-help`, `1c-templates-memory`, `1c-live-ib`. Updated `skills/mcp-1c-tools`.
- **Tier D.** Added new prompts `sdlc`, `uitests`, `ponytail-review`, `previewmode`, `resume`, `setupmcp`. Pi-forked command prompts (`economymode`, `litemode`, `installmcp`, `updatemcp`, `checkmcp`, `installtools`, `deploy-and-test`, `update1cbase`, `loadfrom1cbase`, `restore-testbase`, `build-release`, `install-edt-mcp`, `install-agent-browser`, `install-windows-mcp`) are kept as Pi forks — not wholesale-replaced from upstream. `doctor` stays the package command; the LLM diagnostic remains the Pi fork `prompts/doctor-explain.md`.
- **Tier E.** Added `1c-qa-testing` (Windows test-client script marked as documentation on Linux), `qa-testclient.md`, `1c-ui-regression`, `1c-business-tests`, `1c-change-package`. Updated `ui-testing-tools.md` and `web-client-driving.md`.
- **Tier F.** Added `model-gpt6.md`. Updated `model-adaptation.md` and `model-opus5` / `sonnet5` / `fable5` / `gpt56`. `prompts/rulesmodel.md` (Pi fork) gained `gpt6` as a supported profile slug — the only surgical edit to that fork.
- **Tier G.** Added `project-memory.md` and `memory-setup.md` with a Pi banner: connected Cognee (`memory` :8001) and OpenViking (`knowledge` :1933) win over templates `remember`. Added `extension-workspace.md` pointing at `rules-1c/core/extension-targeting.md`. Added `mcp-deployment.md` as optional shared-host guidance. Updated `dev-standards-env.md` (keys stay in the project `.dev.env`) and `support-feedback.md` (channel stays optional; `SUPPORT_KEY` is not stored in this profile). The `support`, `supportstatus`, `checkupdates` command prompts are kept as Pi forks. Added optional prompts `install-atlassian-mcp`, `install-officecli`, `install-rtk`, `installfilesupdatescript`.
- **Agents.** 13 `agents/1c-*.md` files keep Pi frontmatter and now follow `subagent-core.md`, plus the JSON `## Upstream Handoff` keys the profile tests require.
- **Reconciliation.** `designer-batch-checks.md`, `help-corpus-retrieval.md`, and `support-feedback.md` were refreshed from this SHA. `dev-standards-core.md` stays as the compatibility router into `dev-standards-env` / `-code-style` / `-change-markers` (kept, not removed).
- **Pi forks kept as-is.** Operational and maintenance command prompts that already exist as Pi forks were not touched by this apply (`checkmcp` stays status-only with explicit repair; `installtools` still routes memory to `/install-memory-mcp`; `doctor-explain`, `installmcp`, `updatemcp`, `deploy-and-test`, `update1cbase`, `loadfrom1cbase`, `restore-testbase`, `build-release`, `install-*`, `economymode`, `litemode`, `getconfigfiles`, `initproject`, `check-uuid`, `checkupdates`, `support`, `supportstatus`, `test-fix-loop`, `evolve`, `updaterules`, `review-airules`). Only genuinely new upstream commands were added as new files.

### profile-original (no to-SHA)

- `/taskmode` — profile-original work-path command. Implemented as a Pi package command (picker + footer pin), not a prompt file. Does not replace `/mode` and does not waive promotion triggers or `syntaxcheck`.

### skip

- `skills/1c-metadata-manage` PowerShell/Python tool wave (form-edit order, sibling validators, `default.vrd`, preview exit code, and related docs). Left in place so local-only `docs/form-patterns.md` and `docs/ssl-patterns.md` are not dropped. Reopen only by an explicit request; this pin will not surface that wave again.
- Skill trees not named in the apply tasks: `v8unpack-cf`, `md-to-docx`, `transcribe`, `handoff`, `caveman`, `prompt-enhancer`, `mermaid-diagrams`, `powershell-windows`, `img-grid-analysis`.
- Pi overlay `rules-1c/core/*`, the lab-extra skill trees (tracked separately via `LAB-EXTRAS.md`, not `ai_rules_1c`), `install.ps1`, and upstream adapters.
- Our memory installer `install-memory-mcp` (not the upstream Cognee on port 8010).

## profile-delta-rules-2026-10-09

- **Date:** 2026-10-09
- **Source:** profile edit. Not an `/review-airules` apply. `upstream.lock.json` is not moved. No to-SHA.
- **Action:** keep these hunks on the next `/review-airules`. Do not wholesale-replace the files from `comol/ai_rules_1c`.

### profile-original (no to-SHA)

- `rules-1c/standards/locks-and-transactions.md` and its router `rules-1c/rules/locks-and-transactions.md` — second posting pattern (ITS 661, beside the existing `БлокировкаДанных` pattern), object edit conflict, event-log / technological-log reading. Headings and the router `description` / scope sentence match the body.
- `rules-1c/standards/platform-solutions.md` §9 — labels for both posting patterns; §10 keeps the external-processor template and points at Background Jobs.
- `rules-1c/standards/registers-design.md` §8 — pointer at both posting patterns, no second listing.
- `rules-1c/standards/dev-standards-architecture.md` §1 → "Background Jobs" checklist, and the router `description` in `rules-1c/rules/dev-standards-architecture.md`.
- `rules-1c/rules/systematic-debugging.md` and `rules-1c/standards/systematic-debugging.md` — pointer to locks §6.
- `rules-1c/rules/data-separation.md`, `rules-1c/rules/exchange-plans.md`, and the matching rows in `rules-1c/rules/coding-standards.md`. Inlined rules, not routed standards.

