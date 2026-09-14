<!-- PI-1C-AGENT:BEGIN -->
# Pi 1C Development Agent

Use the decomposed 1C multi-agent workflow supplied by `pi-1c-agent`.

Before non-trivial work read the adapted upstream context/rules under `rules-1c/` and the Pi-native core rules `modes.md`, `orchestration.md`, `handoff.md`, `openspec.md`, `extension-targeting.md`, and `delivery.md`.

Install scope: rules, agents, skills, prompts and the upstream snapshot belong to the **global** Pi profile (`PI_CODING_AGENT_DIR`). A project keeps only its own data: `.dev.env`, `.pi/1c/**` (manifest, settings, knowledge layers), `src/`, `build/`, `openspec/` and its OpenSpec prompts/skills. Do not install the agent into the project — project-local agent artifacts are a legacy layout that `tools/bootstrap.mjs --project` retires (`--with-agent` restores it only on explicit request).

## PLAN / BUILD

PLAN is a planning workflow, not a refusal mode. If the eventual request requires writes, keep investigating what can be investigated and describe future files/objects in the final plan. Do **not** stop merely because a folder/file cannot yet be created.

A plan is ready only when it contains:

- `## Plan`
- `## Files / objects expected to change`
- `## Risks / edge cases`
- `## Verification`

After `PLAN_READY`, offer Execute in BUILD / Refine / Stay in PLAN. `/1c-execute-plan` must carry the same plan_id into BUILD.

PLAN protects project code but permits planning artifacts only in `openspec/**`, `.pi/1c/plans/**`, `.pi/1c/knowledge-drafts/**`.

## Project initialization

For a new or newly adopted repository, prefer `/1c-init advanced` once the project is trusted and Pi is in BUILD. The wizard reads the pinned upstream `.dev.env.example`, reviews all discovered variables with human explanations, performs read-only autodetection first, shows a redacted preview, and only writes after explicit Apply. It installs project **data** only — the agent itself must already be present in the global profile. Selected extras (scaffold, Configuration Knowledge, OpenSpec) are installed on Apply, not deferred to a follow-up command. Secrets stay only in local `.dev.env`; never copy them to knowledge, AGENTS, handoffs or reports. Read `project-init.md`.

## Target container and delivery

Before creating or borrowing any 1C object, resolve the **target container** (`rules-1c/core/extension-targeting.md`): `knowledge_1c` + root `USER-RULES.md` + `.dev.env` (`NEW_OBJECTS_IN`, `EXTENSION_NAME`, `EXTENSION_NAMES`). State the resolved target in the plan. Never create a new extension implicitly — only on an explicit user request (“отдельное расширение”).

Delivery words (`rules-1c/core/delivery.md`): «собрать / для переноса / в прод» = a binary `.cfe`/`.cf` in `build/` (or `release/`), never a copied XML tree; «исходники» = XML/BSL dump. Never XML-load → whole-extension dump when the target base already has that extension (UUID noise), and report the real delta separately from platform comparison noise.

## Configuration / project knowledge

For non-trivial work, query `knowledge_1c` with the task/object/subsystem when project/configuration-specific context may change the solution. Do not load the whole knowledge store.

Precedence: PROJECT rules/preferences > CONFIGURATION rules/preferences > fresh verified CONFIGURATION facts > generic BASE rules. Draft knowledge is never active. `/1c-config analyze` and `/1c-config update` are PLAN discovery flows; `/1c-learn` creates a draft; activation requires explicit approval in BUILD. Read `knowledge.md`.

## Delegation

Do not collapse explorer/planner/developer/tester/reviewer/fixer roles into one prompt when specialized agents are appropriate. Use `subagent_1c` and pass validated `## Upstream Handoff` sections between stages.

Read-only roles may run in parallel. Writer roles sharing one working tree are sequential. Project-local agents require project trust plus explicit project-agent opt-in.

If `openspec/` exists, use native Pi OpenSpec resources. `/opsx-*` are project prompt templates (`.pi/prompts/`), so they appear in the palette only after `/reload` or a restart; explore/propose belong to PLAN; apply requires BUILD; verify/archive follow implementation verification. A proposal and every PLAN summary start with 5–8 plain-language lines before the artifacts.
<!-- PI-1C-AGENT:END -->

<!-- agent-shared-context:global-memory-rule:start -->
# Shared Context and Post-Task Memory Rule

Use the existing shared-context skills whenever previous decisions, errors, preferences, constraints, project history, prior work, or documentation may affect the current task. Do not create duplicate Cognee/OpenViking skills.

## Startup recall

- At the start of every meaningful task, run or follow the existing `context-bootstrap` skill where available to check shared memory (Cognee) and knowledge (OpenViking) before assuming.
- Treat current project files/configuration as authoritative for current state.
- Recall only relevant context; never dump the whole memory/knowledge store.

## Post-task memory policy

After a substantial task, consider recording durable shared context using `C:/ProgramData/devops-awg/config/agent-memory/task-completion-template.md`.

A task is substantial when it creates or changes durable files/configuration, completes a multi-step investigation, fixes a defect, makes an architectural/workflow decision, changes agent behavior, or leaves reusable project/user knowledge. Skip routine Q&A, trivial reads, failed attempts with no reusable lesson, and transient command output.

Use these common summary fields: idempotency_key, status, agent, date, content_hash, scope, task, facts, decisions, changed_paths, verification, unconfirmed, next_steps.

Routing:
- Cognee: `memory_remember` for short durable facts, decisions, preferences, and error lessons.
- OpenViking: `knowledge_remember` for detailed reports, longer handoffs, procedures, design notes, or documentation-like knowledge.
- If both apply, store a short Cognee pointer/fact and the detailed report in OpenViking.
- These are the only permitted shared-context mutating tools: do not use `memory_forget`, `memory_call_tool`, `knowledge_write`, `knowledge_edit`, `knowledge_add_resource`, `knowledge_forget`, `knowledge_cancel_watch`, or other mutating tools.

Safety and idempotency:
- Redact secrets before any MCP tool call or pending-queue write: tokens, passwords, cookies, API keys, private keys, Authorization headers, credentialed DSNs, and secret-store values become `[REDACTED:<kind>]`.
- Never store credentials, raw secrets, private keys, cookies, or temporary execution output.
- Use task/agent/date/content_hash idempotency: `task=<stable task or plan id>; agent=<agent/runtime>; date=<YYYY-MM-DD>; content_hash=<sha256 of the redacted content>`. Compute the hash only after redaction. Search existing memory/knowledge or pending records for that key before recording; update/merge rather than duplicate.
- If runtime approval for Cognee/OpenViking writes is not granted, the MCP server is unavailable, or the tool call fails, state the memory/knowledge write as `UNVERIFIED`/`UNCONFIRMED`, save a redacted pending record under `C:/ProgramData/devops-awg/state/agent-memory/pending/` when local filesystem is available, and continue local implementation.
- Explicitly mark unconfirmed facts as unconfirmed; never present pending or failed remote writes as confirmed.
- Keep global memory separate from project-scoped memory.
<!-- agent-shared-context:global-memory-rule:end -->

## Docker / MCP-инфраструктура (изоляция AWG)

Агент **не запускает docker/podman** и не управляет контейнерами. Сеть pi изолирована через AWG-контейнер, а docker-контейнеры создаются вне этого network namespace и обходят kill-switch (например, `docker run --network host`). По этой причине docker-сокет агенту недоступен, а соответствующие команды блокируются.

Если требуется установка/обновление/перезапуск MCP-серверов — **не пытайся выполнить docker сам**. Вместо этого выдай пользователю готовую команду и попроси выполнить её вручную в обычном терминале хоста:

- управление MCP-контейнерами: `~/mcp-ctl.sh`
- обновление MCP с vibecoding1c.ru: `~/mcp-host.sh update` (или в терминале хоста запустить `pi` и выполнить `/updatemcp`, `/installmcp`, `/checkmcp`, `/installtools`)

Не обходи это ограничение (не подменяй сокет, не используй альтернативные docker-клиенты, не ходи через Portainer API).
