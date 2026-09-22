# Pi 1C Agent v0.7.0

Multi-agent пакет для **vanilla Pi** для разработки на 1С:Предприятие.

v0.7.0 — первый tagged GitHub-релиз: fail-closed ASK/PLAN, secret egress до remote distill, `/approve safe` как allowlist для shell, и product README в корне профиля.

## Базовая архитектура

```text
BASE ai_rules_1c
        ↓
CONFIGURATION FACTS
        ↓
CONFIGURATION RULES / PREFERENCES
        ↓
PROJECT RULES / PREFERENCES
```

При конфликте нормативный приоритет обратный по стрелке: PROJECT > CONFIGURATION rules > verified configuration facts > generic BASE rules. Assumptions никогда не должны молча переопределять rule/fact.

## ASK / PLAN / BUILD / ANON

A new session starts in ASK (read-only). Override with `--1c-mode` or `PI_1C_DEFAULT_MODE`.

```text
ASK → PLAN_DRAFT → PLAN_READY → BUILD_EXECUTING
Ctrl+Alt+P cycles BUILD → PLAN → ASK
```

PLAN обязан исследовать и построить исполнимый план даже для greenfield-задач, где будущему BUILD придётся создавать папки/файлы. Отсутствие write-доступа не является причиной остановить планирование. ASK не пишет никуда, включая planning roots. Неизвестные custom tools в ASK/PLAN запрещены, пока они явно не входят в read-only inventory: имя вроде `get_and_delete` само по себе не считается чтением.

Planning writes (PLAN only) разрешены только в:

- `openspec/**`
- `.pi/1c/plans/**`
- `.pi/1c/knowledge-drafts/**`

Project code, metadata, Git, dependencies, database state и shell остаются защищены в ASK/PLAN.

Команды:

```text
/mode plan
/mode build
/mode ask
/anon 1|2|3|off
```

## 13 специализированных 1С-субагентов

Сохраняются отдельные роли `explorer`, `analytic`, `architect`, `arch-reviewer`, `planner`, `developer`, `metadata-manager`, `refactoring`, `performance-optimizer`, `error-fixer`, `tester`, `code-reviewer`, `doc-writer`.

- отдельный child Pi = отдельный context window;
- runtime-валидируемый `## Upstream Handoff`;
- nested orchestration блокируется;
- parallel разрешён только для read-only ролей;
- writer stages в одном working tree выполняются последовательно;
- project `.pi/agents` требуют project trust + explicit opt-in;
- upstream `MCP` сохраняется как capability и динамически получает доступные extension/MCP tools.

## Подробная инициализация проекта

После project install рекомендуется один раз выполнить:

```text
/mode build
/init
```

Canonical `/init` asks first: empty source scaffold vs dump from an existing infobase / `.cf` / `.dt`. `/init` is an alias for one release. `/init advanced` skips the source question and runs the empty-scaffold wizard.

Wizard не придумывает собственный ENV-контракт. Source of truth — `.dev.env.example` из закреплённого commit `ai_rules_1c`; `config/dev-env.schema.json` содержит только human-friendly описания и dependency hints. Для текущего pinned upstream описаны **43 переменные** в пяти группах.

Перед вопросами выполняется read-only autodetection:

- `Configuration.xml` → название/версия конфигурации, source root и `CompatibilityMode`;
- `PLATFORM_VERSION` → из CompatibilityMode;
- `PLATFORM_PATH` → из стандартных Windows/Linux каталогов;
- `EXPORT_PATH` → из обнаруженного source root.

Режимы:

```text
/init               # первый вопрос: пустой scaffold или выгрузка из ИБ / .cf / .dt
/init empty         # пустая структура исходников
/init from-ib       # сценарий выгрузки (как /initproject)
/init advanced      # пустой scaffold, все upstream ENV-переменные по одной
/init quick         # ключевые решения, остальное оставить upstream defaults
/init status        # deterministic status + schema drift
/init knowledge     # только каркас .pi/1c знаний (без агента, без .dev.env)
/init            # alias of /init
```

При инициализации wizard отдельно спрашивает корень структуры исходников (обычно `src`) и предлагает создать отсутствующие каталоги:

```text
src/
├── cf/   # основная конфигурация
├── cfe/  # расширения
├── epf/  # внешние обработки
└── erf/  # внешние отчёты

build/                 # gitignored; готовые бинарники OriginalName_YYYYMMDD
├── cf/
├── cfe/
├── epf/
└── erf/

docs/                  # документация в git
└── techtask/          # сырые ТЗ агенту
```

Существующие каталоги и файлы никогда не очищаются и не перезаписываются. Если `Configuration.xml` уже найден в `src/cf`, Knowledge Layer продолжает использовать `src/cf` как configuration source root, а `src` хранится отдельно как общий source-layout root.

Подробный режим для каждой переменной объясняет смысл, показывает autodetect/default/current value и предлагает использовать, изменить или отключить значение. Пустые значения, которые upstream считает валидными, не превращаются в искусственно обязательные поля.

До финального `Apply` проект **не изменяется**. Preview показывает все ENV-состояния, но скрывает секреты. После подтверждения создаются/обновляются:

```text
.dev.env
.gitignore                  # .dev.env, build/
.pi/1c/project.yaml         # без секретов
.pi/1c/init-state.json      # без секретов
.pi/1c/knowledge/           # каркас знаний (всегда)
.pi/1c/knowledge-drafts/
.pi/1c/rules/
```

На POSIX `.dev.env` получает mode `0600`. `IB_PASSWORD`, `REPOSITORY_PASSWORD`, `SUPPORT_KEY` не попадают в preview/project.yaml/init-state/knowledge/handoff. Wizard предупреждает, что обычный Pi text input не гарантирует маскирование секрета, и рекомендует использовать только DEV/TEST credentials.

При желании wizard сразу инициализирует Configuration Knowledge fingerprint. Каркас `.pi/1c/{knowledge,knowledge-drafts,rules}` создаётся всегда, даже если fingerprint выключен. Для уже существующего 1С-репозитория без полного wizard: `/init knowledge` (Cursor: `/init-knowledge`) — без копирования агента и без `.dev.env`. OpenSpec отмечается как включённый, а если native Pi artifacts ещё отсутствуют, следующим шагом предлагается `/openspec-setup`.

`/doctor project` проверяет соответствие upstream `.dev.env.example` UX-схеме и предупреждает, если проект ещё не прошёл `/init`. `/doctor` is an alias.

## Configuration Knowledge Layer

Каноническое project-local хранилище:

```text
.pi/1c/
├── configuration.json
├── knowledge/
│   ├── fingerprint.json
│   └── items/*.json
├── rules/
│   ├── configuration/*.json
│   └── project/*.json
└── knowledge-drafts/*.json
```

Каждый item хранит scope/kind/status/confidence, provenance/evidence, applicability/version, timestamps и fingerprint при verification.

### Инициализация конфигурации

В BUILD:

```text
/config init ERP 2.5 :: 2.5.25.56 :: src
```

### Анализ конфигурации

В PLAN:

```text
/config analyze
```

Pi использует read-only исследование и создаёт **draft proposals**, а не активные правила.

### Обновление конфигурации

В PLAN:

```text
/config update 2.5.26.93 :: проверить изменившиеся механизмы
```

Сравнивается fingerprint, вычисляются changed paths и предлагаются additions/updates/invalidations. Новый fingerprint не становится canonical до approval.

В BUILD:

```text
/config apply <draft-id>
```

### Обучение

```text
/learn <наблюдение или правило>
```

LLM классифицирует FACT / RULE / PREFERENCE / ASSUMPTION, scope configuration/project, provenance/evidence и создаёт draft.

Активация только явно в BUILD:

```text
/learn approve <draft-id>
```

### Rules

```text
/rule add project :: extensions :: Все изменения только через ФСК_Расширение
/rule list
/rule show <id>
/rule audit
/rule conflicts
/rule disable <id>
```

`add` создаёт draft, а не активирует правило автоматически.

### Selective loading

Главный Pi и субагенты используют tool `knowledge_1c` по конкретной задаче/объекту/подсистеме. Полное хранилище не инжектится в каждый context.

## OpenSpec

Native Pi OpenSpec остаётся SDD-слоем:

- explore/propose → PLAN;
- planning writes в `openspec/**` разрешены;
- apply → BUILD;
- verify/archive → после implementation verification.

## Установка

Полный прозрачный install pipeline:

```bash
node tools/install.mjs --global
```

или trusted project install:

```bash
node tools/install.mjs --project
```

Внутри явно выполняются:

1. `pi install` — регистрация package resources;
2. bootstrap pinned upstream;
3. deterministic doctor.

После установки:

```text
/doctor
/doctor          # alias of /doctor
/agents
```

## Upstream lock

Pinned `comol/ai_rules_1c` commit:

```text
8901177ef92b611537fe79a4e4dfe19c600d9cc8
```

Полный upstream snapshot не vendored в публичный ZIP из-за неуточнённой root license, обнаруженной аудитом. Bootstrap получает именно pinned commit.

## Safety boundaries

`/approve` — дополнительный UX-guard в BUILD, а не OS sandbox. Pi выполняется с правами текущего пользователя. `safe` спрашивает перед записью файлов, любым shell, который не доказан как read-only allowlist (`git status` / `ls` / `grep` без метасимволов), и перед MCP/IB mutations. Session-одобрение действует только на тот же tool + risk class + target, не на всю категорию `bash`.

Перед внешней distillation (RouterAI / `stack`) и перед записью в Cognee/OpenViking применяется один egress-filter: generic secret rules плюс exact values из ближайшего `.dev.env`. Если после очистки секрет остаётся, remote distill блокируется, а memory write не выполняется.

`recorded` означает подтверждённый read-back. Cognee ACK без read-back — это `accepted` / pending, не `recorded`. OpenViking-отчёт подтверждается read-back по URI/`correlation_id`.

`engines.node` — `>=22.19.0`. CI проверяет Node 22.19, 22 и 24 на Linux и Windows.
