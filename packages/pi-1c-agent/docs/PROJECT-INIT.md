# /init — подробная инициализация проекта

Source of truth: pinned upstream `.dev.env.example`. UX schema only explains variables and never replaces the upstream contract.

## Commands

- `/init` — choose detailed or quick mode.
- `/init advanced` — review every upstream variable one by one.
- `/init quick` — key decisions only.
- `/init status` — deterministic status and schema-drift check.
- `/init knowledge` — plant `.pi/1c` knowledge dirs only (no agent copy, no `.dev.env`).

## Current pinned variables (43)

### Генерация и политика кода

| # | Variable | Meaning | Class | Secret |
|---:|---|---|---|---|
| 1 | `PREFIX` | Префикс добавленных объектов метаданных и реквизитов. Пусто = создавать без префикса. | advisory | no |
| 2 | `COMPANY` | Имя компании или проекта для комментариев доработки. Пусто вместе с DEVELOPER отключает маркеры. | advisory | no |
| 3 | `DEVELOPER` | Имя/идентификатор разработчика для комментариев доработки. Пусто отключает маркеры. | advisory | no |
| 4 | `PLATFORM_VERSION` | Минимальная версия платформы 1С для кода, чувствительного к версии. Сначала выполняется автодетект из Configuration.xml. | highly-desirable | no |
| 5 | `COMMENT_OPEN` | Шаблон открывающего маркера. Поддерживает {COMPANY}, {DEVELOPER}, {DATE}, {TASK}. | defaulted | no |
| 6 | `COMMENT_CLOSE` | Шаблон закрывающего маркера. Поддерживает те же плейсхолдеры. | defaulted | no |
| 7 | `NEW_OBJECTS_IN` | Политика проекта: основная конфигурация или расширение. | policy | no |

### Платформа, информационная база, расширения и инфраструктура

| # | Variable | Meaning | Class | Secret |
|---:|---|---|---|---|
| 1 | `PLATFORM_PATH` | Каталог установки платформы 1С, содержащий bin/1cv8(.exe). Сначала выполняется автодетект. | highly-desirable | no |
| 2 | `INFOBASE_KIND` | file для файловой ИБ или server для клиент-серверной. | defaulted | no |
| 3 | `INFOBASE_PATH` | Путь к файловой ИБ либо строка подключения к серверной тестовой/DEV базе. | highly-desirable | no |
| 4 | `IB_USER` | Пользователь DEV/TEST ИБ. Пусто = подключение без аутентификации; это валидный режим. | defaulted | no |
| 5 | `IB_PASSWORD` | Только DEV/TEST пароль. Пусто = без пароля. Никогда не переносится в project.yaml или отчёты. | defaulted | yes |
| 6 | `EXTENSION_NAME` | Имя одной целевой конфигурации-расширения. Пусто = операции над основной конфигурацией. | defaulted | no |
| 7 | `EXTENSION_NAMES` | Список расширений через запятую в порядке загрузки для полного effective snapshot. | defaulted | no |
| 8 | `EXPORT_PATH` | Каталог выгрузки исходников. Пусто = корень текущего репозитория. | defaulted | no |
| 9 | `EXTENSIONS_PATH` | Путь, внутри которого лежат каталоги расширений из EXTENSION_NAMES. Пусто = ./cfe. | defaulted | no |
| 10 | `DT_SNAPSHOT_PATH` | Путь к .dt baseline для /restore-testbase. Пусто = восстанавливать только конфигурацию. | defaulted | no |
| 11 | `RELEASE_PATH` | Каталог .cf/.cfe/.cfu для /build-release. Пусто = ./release. | defaulted | no |
| 12 | `LOG_PATH` | Файл лога Designer. Пусто = системный TEMP/1cv8.log. | defaulted | no |
| 13 | `INFOBASE_PUBLISH_URL` | Используется UI-тестами и 1c-data-mcp. Пусто = UI-тесты могут быть пропущены. | highly-desirable | no |
| 14 | `UI_TESTING` | manual = только по запросу; auto = автоматически после deploy/verification; off = выключено. | defaulted | no |
| 15 | `USE_EDT` | Включает EDT-ветку правил и рекомендации EDT-MCP. | install-selection | no |
| 16 | `IBCMD_CONFIG` | Если задан и ibcmd доступен, config-операции выполняются через ibcmd; иначе Designer. | defaulted | no |
| 17 | `PLATFORM_ARGS` | Дополнительные аргументы платформы через запятую. Пусто = без дополнительных аргументов. | defaulted | no |
| 18 | `IBCMD_ARGS` | Дополнительные аргументы ibcmd в форме --key=value. Пусто = без дополнительных аргументов. | defaulted | no |
| 19 | `SUPPORT_GUARD` | deny = запрещать прямые изменения типовых locked-объектов; warn = предупреждать; off = не проверять. | defaulted | no |
| 20 | `NEW_OBJECT_POSITION` | end = как Конфигуратор; byName = по имени внутри группы вида. | defaulted | no |
| 21 | `REPOSITORY_PATH` | Непустое значение включает repository SDLC: захват перед правкой и помещение после проверки. | optional | no |
| 22 | `REPOSITORY_USER` | Пусто = без явного пользователя; повторно спрашивать только после ошибки аутентификации. | defaulted | no |
| 23 | `REPOSITORY_PASSWORD` | DEV/TEST пароль хранилища. Не показывается в preview и не попадает в project.yaml. | defaulted | yes |
| 24 | `REPOSITORY_ALLOW_FORCE` | Опасная настройка: первая половина двойного подтверждения для force/get/commit/unlock с риском потери изменений. | defaulted | no |

### Модели и оркестрация

| # | Variable | Meaning | Class | Secret |
|---:|---|---|---|---|
| 1 | `AGENT_MODEL` | Профиль поведения parent-agent. Пусто = базовый model-neutral ruleset. | defaulted | no |
| 2 | `SUBAGENT_MODEL_CODING` | developer, metadata-manager, architect, performance-optimizer, refactoring. Пусто = текущая/default модель Pi. | defaulted | no |
| 3 | `SUBAGENT_MODEL_ANALYSIS` | planner, analytic, reviewers, tester, doc-writer. Пусто = текущая/default модель Pi. | defaulted | no |
| 4 | `SUBAGENT_MODEL_LIGHT` | explorer и error-fixer. Пусто = текущая/default модель Pi. | defaulted | no |
| 5 | `ORCHESTRATION` | standard = делегировать по необходимости; economy = активнее делегировать чтение/запись субагентам. | defaulted | no |

### Процесс разработки

| # | Variable | Meaning | Class | Secret |
|---:|---|---|---|---|
| 1 | `QUICKFIX_MAX_LINES` | Максимум изменённых BSL-строк для быстрого пути. Пусто/невалидно = 40. | defaulted | no |
| 2 | `DEBUG_FAST_PATH` | standard, extended или off. Управляет тем, когда можно не запускать полный 4-фазный debugging cycle. | defaulted | no |
| 3 | `VERIFICATION_DEPTH` | full, standard или lite. Не ослабляет обязательные проверки high-risk изменений. | defaulted | no |
| 4 | `CAVEMAN` | on, auto или off. Влияет только на стиль ответа, не на correctness/verification. | defaulted | no |

### Канал поддержки ai_rules_1c

| # | Variable | Meaning | Class | Secret |
|---:|---|---|---|---|
| 1 | `SUPPORT_KEY` | Секретный ключ для /support. Пусто = канал поддержки отключён. | optional | yes |
| 2 | `SUPPORT_EMAIL` | Рабочий e-mail автора тикетов. Нужен только если используется /support. | optional | no |
| 3 | `SUPPORT_API_URL` | Обычно оставляется пустым и раскрывается в upstream default; заполнять только для собственного endpoint. | defaulted | no |

## Safety

Before final Apply the wizard performs no project writes. Secrets are redacted from preview, project.yaml, init-state, knowledge and reports. `.dev.env` is added to `.gitignore` and gets mode 0600 on POSIX. Unknown future upstream variables are surfaced as generic questions and schema drift is reported instead of silently dropping them.


## Standard source scaffold (v0.6.1)

`/init` asks for a **source-layout root** separately from the main configuration source root. Recommended layout:

```text
src/
├── cf/   # main configuration dump; Configuration.xml normally lives here
├── cfe/  # configuration extensions
├── epf/  # external data processors
└── erf/  # external reports
```

If the initializer detects `src/cf/Configuration.xml`, it records:

- configuration source root: `src/cf`;
- source-layout root: `src`.

On final Apply it creates **only missing directories**. Existing files and directories are left untouched. The preview explicitly marks each directory as `exists — untouched` or `will create`. Scaffold creation is constrained to paths inside the trusted project.

The generated `.pi/1c/project.yaml` contains both `configuration.sourceRoot` and `sourceLayout.{root,cf,cfe,epf,erf}`. `/init status` and `/doctor project` verify the scaffold after initialization.
