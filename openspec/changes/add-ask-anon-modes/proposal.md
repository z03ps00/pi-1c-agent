## Why

Наш Pi 1C-агент умеет только PLAN и BUILD, стартует сразу в BUILD (записывающий режим) и не умеет работать «без следов». DevOps Pi Agent уже решил эти задачи: у него есть read-only режим вопросов ASK, безопасный старт в read-only, и анонимная сессия ANON, которая не пишет в общую память агентов (Cognee/OpenViking) и локальную очередь. Мы переносим эту логику в 1C-профиль, чтобы получить безопасный старт, режим «просто спросить» и анонимный анализ, не ломая существующие PLAN/BUILD, правила и MCP.

## What Changes

- **BREAKING (поведение старта):** новая сессия 1C-агента по умолчанию стартует в **ASK** (read-only), а не в BUILD. Значение переопределяемо флагом `--1c-mode` и env `PI_1C_DEFAULT_MODE`, чтобы можно было закрепить BUILD.
- Новый режим **ASK** — read-only Q&A: отвечает на вопросы о конфигурации/проекте по read-only инструментам и MCP; запись запрещена полностью (`write`/`edit` скрыты, планировочные записи в `openspec/**`, `.pi/1c/**` тоже недоступны — это только PLAN). Как и в текущем 1C PLAN, `bash` в ASK и PLAN остаётся запрещён.
- **PLAN/BUILD сохраняются**, но получают обвязку из DevOps: авторитетная строка `# Current 1C mode` в системном промпте на каждый ход, одноразовое in-band уведомление `[1C MODE CHANGE]` при смене режима, и устойчивое восстановление состояния сессии (`sanitizeModeState`), чтобы повреждённая запись не роняла `session_start` и не оставляла несогласованную пару mode/phase.
- Новый цикл переключения: `/mode plan|build|ask`, команды `/1c-ask` (+ существующие `/1c-plan|build|execute-plan`), хоткей `Ctrl+Alt+P` — цикл BUILD → PLAN → ASK. Футер показывает `1C:ASK` / `1C:PLAN` / `1C:PLAN READY` / `1C:BUILD [plan_id]`.
- Новая **анонимная сессия ANON** — уровни `off|1|2|3`, команда `/anon`, хоткей `Ctrl+Alt+A` (цикл off → 1 → 2 → 3), флаг `--anon`, env-fallback `PI_1C_ANON`, индикатор футера `anon:off|1|2|3`:
  - `1` — общая память только на чтение: запрет `memory_remember`, `knowledge_remember|write|edit|add_resource` и записей в pending-очередь;
  - `2` — плюс запрет чтения общей памяти (тема не уходит в Cognee/OpenViking); `*_health` остаётся;
  - `3` — плюс эфемерная сессия (лаунчер добавляет `--no-session`) и запрет handoff-документов.
  - Запрет жёсткий и двойной: блок в `pi.on("tool_call")` и `deny` в хуке `pi-mcp-adapter:tool-approval-request` — в любом режиме, включая BUILD. Неизвестный инструмент серверов `memory`/`knowledge` считается записью (fail-closed). Флаг session-scoped: в новую сессию не переносится, resume — переносит.
- **Портативность (обязательное отличие от DevOps):** ANON-пути следов задаются без machine-local абсолютных путей — pending = `$PI_CODING_AGENT_DIR/state/agent-memory/pending/**`, handoff = `handoffs/**` проекта. Это соответствует `agent-runtime-contract` (запрет чужих абсолютных путей) и правилам `AGENTS.md`.
- Согласование правил с реализацией (docs-in-same-change): `rules-1c/core/modes.md`, overlay `AGENTS.md` и `README.md` описывают ASK, ANON и новый дефолт; условная политика памяти (`recall/remember` только при подключённых Cognee/OpenViking) сохраняется.
- Явно **вне scope этого изменения:** стиль `caveman` (у нас своя политика `CAVEMAN=auto`), startup shared-context recall gate и post-task memory completion gate DevOps-профиля — они завязаны на инфраструктуру памяти и рассматриваются отдельно.

## Capabilities

### New Capabilities
- `agent-modes`: runtime-контракт режимов работы 1C-агента (Pi-расширение `1c-mode`) — стейт-машина ASK/PLAN/BUILD с фазами и переключением, дефолтный режим старта, гейтинг инструментов и MCP по режиму, авторитетная строка режима и уведомление о смене, устойчивое восстановление состояния, а также анонимная сессия ANON (уровни 0–3) с двойным запретом записи/чтения общей памяти и портативными путями следов.

### Modified Capabilities
<!-- Требования меняются только у новой capability agent-modes; существующих delta-специй в openspec/specs/ нет. -->

## Impact

- **Реализация (глобальный пакет `pi-1c-agent`, исходник профиля):** `extensions/1c-mode/index.ts`, `lib/plan-state.mjs`, `lib/plan-policy.mjs`; новые модульные тесты (`tests/plan-state.test.mjs`, `tests/plan-policy.test.mjs`, при необходимости новый anon-тест). Расширение `1c-mode` — единственная точка enforcement (host = Pi).
- **Профиль/документация (этот репозиторий):** `rules-1c/core/modes.md`, `AGENTS.md`, `README.md`; при необходимости раздел про `/anon` в каталоге команд `prompts/commands.md`.
- **Двойной хост:** enforcement (блок записи, ANON, скрытие инструментов) работает только в Pi. Cursor читает тот же `AGENTS.md`, но PLAN/ASK/ANON как runtime-гейты не применяет — это фиксируется в README как известное ограничение.
- **Совместимость:** смена дефолта на ASK меняет видимое поведение старта и требует правки существующих тестов/ожиданий `initialModeState`; переопределяется env/флагом. Пути ANON портативны, machine-local путей DevOps (`/mnt/vol_328/MCP/...`) не вносим.
- **Зависимости:** новых внешних зависимостей нет; используются существующие Pi extension API, `pi-mcp-adapter` события и опциональные MCP `memory`/`knowledge`.
