<!-- PI-1C-AGENT:BEGIN -->
# Pi 1C Development Agent

Use the decomposed 1C multi-agent workflow supplied by `pi-1c-agent`.

Before non-trivial work read the adapted upstream context/rules under `rules-1c/` and the Pi-native core rules `modes.md`, `orchestration.md`, `handoff.md`, `openspec.md`, `extension-targeting.md`, and `delivery.md`. Process documents: this overlay, then `rules-1c/AGENTS-UPSTREAM.md`, then `rules-1c/core/*`.

Install scope: rules, agents, skills, prompts and the upstream snapshot belong to the **global** Pi profile (`PI_CODING_AGENT_DIR`). A project keeps only its own data: `.dev.env`, `.pi/1c/**` (manifest, settings, knowledge layers), `src/`, `build/`, `openspec/` and its OpenSpec prompts/skills. Do not install the agent into the project — project-local agent artifacts are a legacy layout that `tools/bootstrap.mjs --project` retires (`--with-agent` restores it only on explicit request).

Canonical slash commands have no `1c-` prefix (`/init`, `/doctor`, `/installmcp`, `/commands`). One command per verb — no `/1c-*` aliases and no prompt file that repeats a package `registerCommand` name. Catalog: `/commands`. Do not register `/help`, `/plan`, `/debug`. Mode switch is `/mode plan|build|ask`. Anonymous session is `/anon 1|2|3|off` (`Ctrl+Alt+A`).

Comol `ai_rules_1c` updates for **this profile** go through `/review-airules` and `UPSTREAM-REGISTER.md`. `/updaterules` and `/checkupdates` are for 1C *projects* that use `install.ps1`, not for syncing this profile.

## ASK / PLAN / BUILD / ANON

A **new** Pi session starts in **ASK** (read-only Q&A). Override with `--1c-mode` or `PI_1C_DEFAULT_MODE`. `/mode ask|plan|build`; `Ctrl+Alt+P` cycles BUILD → PLAN → ASK.

ASK answers questions with read-only tools. File writes are disabled completely — including `openspec/**` and `.pi/1c/**`. `bash` is disabled in ASK and PLAN.

PLAN is a planning workflow, not a refusal mode. If the eventual request requires writes, keep investigating what can be investigated and describe future files/objects in the final plan. Do **not** stop merely because a folder/file cannot yet be created.

A plan is ready only when it contains:

- `## Plan`
- `## Files / objects expected to change`
- `## Risks / edge cases`
- `## Verification`

After `PLAN_READY`, offer Execute in BUILD / Refine / Stay in PLAN. Switch with `/mode build`; keep the same `plan_id`.

PLAN protects project code but permits planning artifacts only in `openspec/**`, `.pi/1c/plans/**`, `.pi/1c/knowledge-drafts/**`.

**Anonymous session.** `/anon 1|2|3|off`, `Ctrl+Alt+A`. Level 1: no writes to Cognee/OpenViking and no pending record under `$PI_CODING_AGENT_DIR/state/agent-memory/pending/**`. Level 2: plus no reads. Level 3: plus no `handoffs/**` documents (full ephemeral transcript needs `--no-session`). Double-enforced in every mode. Substantial turns report `Memory: skipped — anonymous`. New session starts at `anon:off`.

**Dual host.** ASK/PLAN/BUILD/ANON tool gates exist in **Pi** (`1c-mode`). Cursor loads this `AGENTS.md` but does **not** enforce the write-block or anon denials. `/init` TUI is Pi-only. Cursor users follow the same prompts as procedures.

## Project initialization

For a new or newly adopted repository, prefer `/init` once the project is trusted and Pi is in BUILD. First question: empty source scaffold vs dump from an existing infobase / `.cf` / `.dt`. `/initproject` is the from-IB alias. The wizard reads the pinned upstream `.dev.env.example`, reviews all discovered variables with human explanations, performs read-only autodetection first, shows a redacted preview, and only writes after explicit Apply. It installs project **data** only — the agent itself must already be present in the global profile. Selected extras (scaffold, Configuration Knowledge, OpenSpec, and lab extras Vanessa / КД / Humanizer RU) are installed on Apply, not deferred to a follow-up command. Secrets stay only in local `.dev.env`; never copy them to knowledge, AGENTS, handoffs or reports. Read `project-init.md`.

## Lab extras (not ai_rules_1c)

`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, and `humanizer-ru` ship in the **global** profile `skills/`. `/init` may ask them; silence is No; Apply writes project dirs / `.dev.env` keys (Vanessa/KD) or a preference flag (Humanizer) — never copies those skill trees into the 1C project. Declined extras can be enabled later (`/install-vanessa-mcp`, extras re-ask, first-use consent) without a full re-init. They are **not** `comol/ai_rules_1c`: refresh via `LAB-EXTRAS.md`, not `/review-airules`. Vanessa MCP is opt-in (`mcp.optional/vanessa.json`); toolkit stays HTTP; Humanizer has no MCP. Russian «очеловечь» → `humanizer-ru`, not English `humanizer`. Vanessa `.feature` → `vanessa-mcp`; web-client tests stay on `UI_TESTING` / browser.

## Target container and delivery

Before creating or borrowing any 1C object, resolve the **target container** (`rules-1c/core/extension-targeting.md`): `knowledge_1c` + root `USER-RULES.md` + `.dev.env` (`NEW_OBJECTS_IN`, `EXTENSION_NAME`, `EXTENSION_NAMES`). State the resolved target in the plan. Never create a new extension implicitly — only on an explicit user request (“отдельное расширение”).

Delivery words (`rules-1c/core/delivery.md`): «собрать / для переноса / в прод» = a binary `.cfe`/`.cf` in `build/` (or `release/`), never a copied XML tree; «исходники» = XML/BSL dump. Never XML-load → whole-extension dump when the target base already has that extension (UUID noise), and report the real delta separately from platform comparison noise.

## Configuration / project knowledge

For non-trivial work, query `knowledge_1c` with the task/object/subsystem when project/configuration-specific context may change the solution. Do not load the whole knowledge store.

Precedence: PROJECT rules/preferences > CONFIGURATION rules/preferences > fresh verified CONFIGURATION facts > generic BASE rules. Draft knowledge is never active. `/config analyze` and `/config update` are PLAN discovery flows; `/learn` creates a draft; activation requires explicit approval in BUILD. Read `knowledge.md`.

## Delegation

Do not collapse explorer/planner/developer/tester/reviewer/fixer roles into one prompt when specialized agents are appropriate. Use `subagent_1c` and pass validated `## Upstream Handoff` JSON sections between stages (`rules-1c/core/handoff.md`). Markdown `Handoff for the next subagent` is not the contract.

Read-only roles may run in parallel. Writer roles sharing one working tree are sequential. Project-local agents require project trust plus explicit project-agent opt-in.

If `openspec/` exists, use native Pi OpenSpec resources. `/opsx-*` are project prompt templates (`.pi/prompts/`), so they appear in the palette only after `/reload` or a restart; explore/propose belong to PLAN; apply requires BUILD; verify/archive follow implementation verification. A proposal and every PLAN summary start with 5–8 plain-language lines before the artifacts.
<!-- PI-1C-AGENT:END -->

<!-- agent-shared-context:global-memory-rule:start -->
# Shared Context and Post-Task Memory Rule

Use the existing shared-context skills whenever previous decisions, errors, preferences, constraints, project history, prior work, or documentation may affect the current task. Do not create duplicate Cognee/OpenViking skills.

Recall Cognee / OpenViking **only when those servers are opted in and connected** (present in `mcp.json` and actually available). When they are off, treat project files as the only required context source. Do not call Cognee `remember`/`recall` or OpenViking `remember` and do not treat a failed memory write as a task failure.

## Startup recall

- At the start of every meaningful task, run or follow the existing `context-bootstrap` skill where available.
- If memory/knowledge MCP is not in `mcp.json` or not connected, note “memory MCP not in use” **once** and proceed with project files. Do not retry the missing server in a loop.
- Treat current project files/configuration as authoritative for current state.
- Recall only relevant context; never dump the whole memory/knowledge store.

## Post-task memory policy

After a substantial task, if Cognee and/or OpenViking are opted in and connected, consider recording durable shared context using `$PI_CODING_AGENT_DIR/state/agent-memory/task-completion-template.md`. If they are not opted in, skip memory writes.

A task is substantial when it creates or changes durable files/configuration, completes a multi-step investigation, fixes a defect, makes an architectural/workflow decision, changes agent behavior, or leaves reusable project/user knowledge. Skip routine Q&A, trivial reads, failed attempts with no reusable lesson, and transient command output.

Use these common summary fields: idempotency_key, status, agent, date, content_hash, scope, task, facts, decisions, changed_paths, verification, unconfirmed, next_steps.

Routing (only when the corresponding server is opted in):
- Cognee (`memory`, host `127.0.0.1:8001`, dataset `main_dataset`): tool `remember` for short durable facts, decisions, preferences, and error lessons (Pi may namespace it as `memory_remember`).
- OpenViking (`knowledge`, host `127.0.0.1:1933`): tool `remember` for detailed reports, longer handoffs, procedures, design notes, or documentation-like knowledge (Pi may namespace it as `knowledge_remember`).
- If both apply, store a short Cognee pointer/fact and the detailed report in OpenViking.
- These are the only permitted shared-context mutating tools. Do not use Cognee `forget` / `call_tool`, or OpenViking `write` / `edit` / `add_resource` / `forget` / `cancel_watch`. A correction is a **new** `remember` that explicitly supersedes the old record.

Safety and idempotency:
- Redact secrets before any MCP tool call or pending-queue write: tokens, passwords, cookies, API keys, private keys, Authorization headers, credentialed DSNs, and secret-store values become `[REDACTED:<kind>]`.
- Never store credentials, raw secrets, private keys, cookies, or temporary execution output. Tilda passwords, license keys, IB passwords, and `KNOWLEDGE_MCP_AUTHORIZATION` stay in local secret files (`.dev.env`, `auth.json`, installer `config.env` outside git) — never `memory.md`, Cognee, OpenViking, AGENTS, or handoffs.
- Use task/agent/date/content_hash idempotency: `task=<stable task or plan id>; agent=<agent/runtime>; date=<YYYY-MM-DD>; content_hash=<sha256 of the redacted content>`. Compute the hash only after redaction. Search existing memory/knowledge or pending records for that key before recording; update/merge rather than duplicate.
- If runtime approval for Cognee/OpenViking writes is not granted, the MCP server is unavailable, or the tool call fails, state the memory/knowledge write as `UNVERIFIED`/`UNCONFIRMED`, save a redacted pending record under `$PI_CODING_AGENT_DIR/state/agent-memory/pending/` when local filesystem is available, and continue local implementation.
- Explicitly mark unconfirmed facts as unconfirmed; never present pending or failed remote writes as confirmed.
- Keep global memory separate from project-scoped memory.
<!-- agent-shared-context:global-memory-rule:end -->

## Docker / MCP

Docker / Podman is a product capability. Use it when the engine is reachable (`docker ps` or equivalent succeeds). Confirm before creating or mutating containers (`docker run`, `compose up`, image pull).

If Docker is unavailable (no socket, permission denied, isolated namespace) **or** `PI_1C_BLOCK_DOCKER=1` is set, detect that **once**, tell the user, print host copy-paste commands, and do not retry docker in a loop.

`~/mcp-ctl.sh` / `~/mcp-host.sh` are **this lab’s** optional helpers. They are not required on Windows Docker Desktop or a normal Linux/macOS machine, and they are not the only documented mutate path.

Default `mcp.json` does not register Cognee, OpenViking, 1C bundle ports `8002`–`8008`, or Vanessa Automation MCP. Opt in with `/installtools` or a standalone installer (`/installmcp`, `/install-memory-mcp`, `/install-vanessa-mcp`). `/install-cognee` and `/install-openviking` install **our** paired stack, not the upstream `comol` Cognee. Disable by removing that one fragment from `mcp.json` without touching other servers. Optional fragments live in `mcp.optional/`. Compose for memory: `mcp.optional/memory-stack/`. MCP Toolkit HTTP and Humanizer RU are never MCP servers.
