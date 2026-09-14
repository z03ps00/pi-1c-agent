---
name: 1c-mcp-toolkit
description: Talks to a live 1C infobase over HTTP via MCP_Toolkit.epf (ROCTUP) — execute_query, execute_code, metadata, event log. Use when working with a running 1C session, Конвертация данных КД 2/КД 3, MCP Toolkit ports, or calling BSL in a live IB without publishing hs/mcp.
---

# 1C MCP Toolkit — HTTP API к живой базе 1С

> **Lab extra (beta).** Snapshot owned by this Pi 1C profile’s author. It may grow or change independently of `comol/ai_rules_1c`. It is **not** part of `/review-airules`. Canonical copy: `$PI_CODING_AGENT_DIR/skills/1c-mcp-toolkit/`. This is HTTP via `MCP_Toolkit.epf`, **not** an MCP server in default `mcp.json`.

REST на `http://localhost:<порт>/api/*` через обработку `MCP_Toolkit.epf` в тонком
или толстом клиенте. Нативная компонента `MCPHttpTransport`. Конфигурацию менять
не нужно, COM и веб-публикация не нужны.

Обработка: [ROCTUP/1c-mcp-toolkit](https://github.com/ROCTUP/1c-mcp-toolkit).
Адаптация скилла [Desko77/cursor-1c-skills](https://github.com/Desko77/cursor-1c-skills)
(MIT). EPF в проекте каркаса: **`tools/mcp-toolkit/MCP_Toolkit.epf`** (скачивается
скриптом, в git скилла бинарника нет).

Для правил КД 2.0 / 3.1 — скиллы `kd2-rules` / `kd31-rules` поверх этого API.

## Протокол: порты не переспрашивать

1. Карта портов — проект `.dev.env`: `MCP_TOOLKIT_PORT`, `KD2_PORT`, `KD31_PORT`.
   Есть карта — health-probe по этим портам, не спрашивать. Не зашивать путь к
   чужому ПК. Скрипты: `$PI_CODING_AGENT_DIR/skills/1c-mcp-toolkit/scripts/`.
2. Health-probe вместо вопросов:

```sh
bash "$PI_CODING_AGENT_DIR/skills/1c-mcp-toolkit/scripts/health-probe.sh"
# Windows: follow powershell-windows; .\health-probe.ps1
# или: MCP_TOOLKIT_PORT=7003 bash .../health-probe.sh
```

3. Ничего не живо — **не** запускать 1С скриптом за пользователя. Сказать открыть
   тонкий/толстый клиент ИБ КД (копия, не боевая) и Файл → Открыть
   `tools/mcp-toolkit/MCP_Toolkit.epf`, затем встроенный сервер. Чеклист:
   [`docs/integration.md`](docs/integration.md).
4. Ошибка «функция не определена» / connection refused — сначала probe, потом код.
5. Не предлагать рестарт `rphost`/`rmngr` при обычном обновлении конфигурации.

Fallback: если toolkit молчит, а ИБ опубликована с `1c-data-mcp` —
`vcexecutequery` / `vcexecutecode` **только после явного согласия** пользователя.
По умолчанию toolkit не подменять.

## Где лежит EPF

| ОС | Ассет GitHub latest | В проекте |
|----|---------------------|-----------|
| Linux | `MCP_Toolkit_linux.epf` | `tools/mcp-toolkit/MCP_Toolkit.epf` |
| Windows | `MCP_Toolkit.epf` | то же имя |
| macOS | `MCP_Toolkit_macos.epf` | то же имя |

Нативная компонента **зависит от ОС**. Версия — `tools/mcp-toolkit/VERSION.txt`.
В конфигурацию не загружать: только открыть в сессии.

## Быстрый старт

Пользователь открывает EPF в клиенте 1С. На вкладке «Подключение»: встроенный
сервер, порт из карты, формат TOON (или JSON), «Запустить сервер». Для записи
правил КД снять защиту на слова `Записать`, `Удалить`,
`УстановитьПривилегированныйРежим`.

Проверка:

```sh
curl -sS -m 2 "http://localhost:${MCP_TOOLKIT_PORT:-6003}/health"
bash scripts/query.sh "ВЫБРАТЬ 1 КАК Поле"
```

Закрыть сеанс 1С (клиентский контекст):

```sh
# код в файле close.bsl: ЗавершитьРаботуСистемы(Ложь, Ложь); Результат = "OK";
# затем: bash scripts/exec.sh close.bsl
# execute_code с execution_context=client — см. references/tools-full-reference.md
```

## Когда использовать

Живая база: данные, вызов экспортных функций, журнал, ссылки, права, КД.

Когда лучше другое:

| Задача | Лучше |
|--------|--------|
| BSL/XML исходников в git | comol `1c-metadata-manage`, MCP code/graph |
| Синтаксис BSL | `syntaxcheck` |
| Качество кода | `check_1c_code` / `review_1c_code` |
| Vanessa UI | скилл `vanessa-mcp` |

## Scripts

POSIX under `$PI_CODING_AGENT_DIR/skills/1c-mcp-toolkit/scripts/`. Windows twins: `health-probe.ps1`, `query.ps1`, `exec.ps1`. Follow `powershell-windows` on Windows.

- `health-probe.sh` / `health-probe.ps1` — обход портов из `.dev.env` / типичных 6003, 7003, 6011, …
- `query.sh` / `query.ps1` `"<запрос>" [out.json]` — `execute_query` (`MCP_TOOLKIT_PORT`, дефолт 6003)
- `exec.sh` / `exec.ps1` `<файл.bsl> [out.json]` — `execute_code` (результат в `Результат`, не `Возврат`)

Кириллица: ответ в файл, читать через Read. One-off BSL — во временный каталог проекта, не в `src/`.

## 12 эндпоинтов

| # | Эндпоинт | Метод | Назначение |
|---|----------|-------|-----------|
| 1 | get_metadata | GET/POST | Метаданные |
| 2 | execute_query | POST | Запрос 1С |
| 3 | execute_code | POST | BSL, вернуть `Результат` |
| 4 | get_object_by_link | POST | Объект по navigation link |
| 5 | get_link_of_object | POST | Navigation link |
| 6 | find_references_to_object | POST | Ссылки в БД |
| 7 | get_access_rights | POST | Права |
| 8 | get_event_log | POST | Журнал |
| 9 | get_bsl_syntax_help | POST | Справка платформы |
| 10 | submit_for_deanonymization | POST | Деанонимизация |
| 11 | restart_1c_session | POST | Перезапуск сессии |
| 12 | close_1c_session | POST | Закрыть сессию |

Полная справка: [references/tools-full-reference.md](references/tools-full-reference.md).

## Формат ответов

Обёртка JSON: `{"success": true, "data": ...}` или `{"success": false, "error": "..."}`.
`data` по умолчанию **TOON**. `RESPONSE_FORMAT=json` на сервере или в форме.

Ссылки в `execute_query` — `object_description` (`_objectRef`, UUID, тип).
Спека: [references/object-description-format.md](references/object-description-format.md).

## Экранирование curl

Payload в файл через `query.sh` / `exec.sh`. Строки запроса — параметрами, не литералами.
Не вставлять `!` в payload (history expansion).

## Запись в ИБ

По умолчанию toolkit блокирует `Записать`, `Удалить`,
`УстановитьПривилегированныйРежим`. Для КД — снять в форме **на копии ИБ**, не на
боевой. Любая ошибка в одном `execute_code` откатывает все `Записать()` вызова.

## Channel

Несколько toolkit на одном порту: `?channel=<name>` (`^[a-zA-Z0-9_-]{1,64}$`).

## Совместимость

Платформа 8.2.13+ / 8.3.25+. Только тонкий или толстый клиент; веб-клиент нативную
компоненту не грузит. Ассет EPF должен совпасть с ОС.

## Связанные скиллы

- `kd2-rules`, `kd31-rules` — правила Конвертации данных.
- Синтаксис запросов — comol `query-writing` / MCP `syntaxcheck`.

## References

- [references/tools-full-reference.md](references/tools-full-reference.md)
- [references/object-description-format.md](references/object-description-format.md)
- [references/workflow-examples.md](references/workflow-examples.md)
