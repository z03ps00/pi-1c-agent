# Интеграция Vanessa Automation + MCP (lab extra)

Пошаговая инструкция для **проекта 1С**, который включил Vanessa extras. Скилл живёт в профиле: `$PI_CODING_AGENT_DIR/skills/vanessa-mcp/`. Каркас **не** копирует скилл в проект.

Официальная справка Vanessa: [docs/AI/index.md](https://github.com/Pr-Mex/vanessa-automation/blob/develop/docs/AI/index.md).  
Расширение MCP (нейрофиш): [onec-client-mcp-devkit](https://github.com/1c-neurofish/onec-client-mcp-devkit).

> **Важно:** [vladimir-kharin/1c_mcp](https://github.com/vladimir-kharin/1c_mcp) и `1c-data-mcp` — **другой** класс MCP (данные ИБ). Они **не** заменяют Vanessa Automation MCP и **не** водят клиент тестирования.

Этот профиль **не** кладёт EPF/CFE в git. Скачивать Vanessa EPF, VAExtension, `client_mcp.cfe` только если пользователь явно подтвердил бинарники в этом запуске.

---

## 1. Данные проекта (не скилл)

После Yes на Vanessa extras `/init` (или later-enable) в проекте появляются:

| Путь | Назначение |
|------|------------|
| `tests/features/` | Сюда кладём `.feature` |
| `tests/fixtures/` | JSON/XML/CSV для сценариев |
| `tests/screenshots/`, `tests/reports/` | Артефакты прогонов (в git не коммитятся) |
| `.dev.env` → `VANESSA_MCP_URL` | URL из формы «Управление MCP»; пусто, пока пользователь не дал host:port |

Опционально, если пользователь подтвердил бинарники: `tools/vanessa/`, `tools/neurofish-mcp/`. Не создавать эти каталоги при одном только Yes на сценарии.

Платформа: `PLATFORM_PATH` в проекте `.dev.env`. URL Vanessa — тот же ключ или активный MCP-фрагмент `mcp.optional/vanessa.json` (`${VANESSA_MCP_URL}`). Фрагмент **не** входит в default `mcp.json`.

---

## 2. Подготовка ИБ менеджера тестирования

Нужна ИБ менеджера тестирования (путь — в проекте `.dev.env`, не в этом скилле).

1. Открой базу в **Конфигураторе**.
2. Конфигурация → Расширения конфигурации → добавить из файла `client_mcp.cfe` (локальная копия пользователя).
3. Сними «безопасный режим» / ограничения, если Конфигуратор предупреждает.
4. Обнови конфигурацию БД (F7). Закрой Конфигуратор.

Профиль **не** загружает расширение в ИБ сам.

---

## 3. Vanessa и VanessaExt

1. В менеджере тестирования: Файл → Открыть → локальный `vanessa-automation-single.epf`.
2. В настройках Vanessa включи внешнюю компоненту **VanessaExt**.

---

## 4. Клиент тестирования + VAExtension

Нужен **второй** сеанс — то, что реально тестируем.

1. В ИБ клиента установи `VAExtension.cfe`.
2. В Vanessa открой таблицу профилей клиентов тестирования.
3. Имя профиля **не** зашивай заранее — читай список (`manage_test_client_profiles`) и подключай то имя, которое есть.

---

## 5. Запуск MCP-сервера

1. Предприятие → менеджер тестирования, Vanessa открыта, VanessaExt включён.
2. В расширении MCP нажми **Запустить**.
3. Запомни URL/порт в форме «Управление MCP». Запиши в `.dev.env` как `VANESSA_MCP_URL` (например `http://127.0.0.1:<порт>/mcp`). Не копируй порт с чужого ПК.

Проверка на той же машине, где слушает 1С (Linux/macOS `curl`; Windows — `powershell-windows` / `Invoke-WebRequest`):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" "$VANESSA_MCP_URL"
# Часто: 406 без Accept: text/event-stream — норма
```

Пока сеанс 1С закрыт или MCP не «Запущен» — агент не должен изображать `run_scenario`.

Если агент в другом network namespace и не видит loopback хоста — это настройка машины, не профиля.

---

## 6. Opt-in MCP в профиле

Фрагмент: `$PI_CODING_AGENT_DIR/mcp.optional/vanessa.json`. Merge только после согласия и URL (`/install-vanessa-mcp` или `/installtools` extra row, или `/init` Vanessa=yes **плюс** явный URL). `recommended` Vanessa **не** предвыбирает.

Написание и прогон `.feature` — по скиллу `$PI_CODING_AGENT_DIR/skills/vanessa-mcp/SKILL.md`: состояние → шаги из библиотеки → `check_syntax` → `run_scenario`. Шаги Gherkin не выдумывать.

---

## 7. Каталоги Vanessa

В Vanessa (UI или VAParams) укажи пути **этого** проекта:

| Параметр | Путь |
|----------|------|
| Каталог фич | `<корень проекта>/tests/features` |
| Каталог отчётов | `<корень проекта>/tests/reports` |
| Каталог скриншотов | `<корень проекта>/tests/screenshots` |

Каталоги в метаданных конфигурации **не** регистрируются. `.feature` не класть в `src/` или `_docs/`.

---

## 8. Чеклист готовности

| # | Проверка |
|---|----------|
| 1 | Есть локальный Vanessa EPF (если пользователь его ставил) |
| 2 | В ИБ менеджера установлено `client_mcp.cfe`, БД обновлена |
| 3 | VanessaExt включён |
| 4 | VAExtension в клиенте тестирования |
| 5 | Профиль клиента тестирования подключается из Vanessa |
| 6 | MCP «Запущен», URL из `.dev.env` / MCP config отвечает |
| 7 | Сессия видит Vanessa MCP tools |
| 8 | Каталог фич = `tests/features` |

---

## 9. Что не путать

| Компонент | Роль |
|-----------|------|
| Vanessa EPF | Движок сценариев Gherkin |
| `client_mcp.cfe` (нейрофиш) | MCP-сервер **для Vanessa** |
| VAExtension | Расширение **клиента** тестирования |
| VanessaExt | Внешняя компонента (скрин/OS и др.) |
| `1c_mcp` / `1c-data-mcp` | Другой MCP: данные ИБ, не UI Vanessa |
| Web-client `UI_TESTING` | Браузерный путь `1c-tester` — не подмена Vanessa |
