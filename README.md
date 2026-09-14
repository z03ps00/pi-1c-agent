# pi-1c-agent — personal Pi profile (`config-1c`)

Персональный профиль Pi 1C-агента (`PI_CODING_AGENT_DIR`): правила, агенты, навыки,
промпты, настройки MCP и модели. Репозиторий нужен, чтобы дорабатывать профиль
на любой машине и держать изменения под git-историей.

## Что внутри

| Путь | Назначение |
| --- | --- |
| `AGENTS.md` | корневые инструкции профиля (маркеры `PI-1C-AGENT`, shared-memory rule) |
| `rules-1c/` | адаптированные правила 1C + снимок upstream (`core/`, `rules/`, `standards/`, `*-reference/`) |
| `agents/` | определения субагентов (`1c-explorer`, `1c-developer`, `1c-tester`, …) |
| `skills/` | навыки профиля (metadata, repository, caveman, context-*, handoff, v8unpack-cf, …) |
| `prompts/` | шаблоны команд (`/1c-*`) |
| `settings.json` | тема, провайдер/модель по умолчанию, список пакетов Pi |
| `mcp.json` | MCP-серверы (значения через переменные окружения) |
| `models-store.json`, `cursor-sdk*.json` | локальные каталоги моделей и настройки SDK |
| `auth.example.json`, `trust.example.json` | шаблоны локальных файлов с секретами/путями |

## Что НЕ внутри (и почему)

* `auth.json` — API-ключи провайдеров. Только локально.
* `trust.json` — пути доверенных проектов конкретной машины.
* `mcp-cache.json`, `cursor-sdk-model-list.json` — кэш, восстанавливается сам.
* `node/`, `npm/`, `bin/` — node.exe, node_modules Pi и `rg`/`fd` (~255 МБ).
* `1c/` — состояние bootstrap с абсолютными путями машины (перегенерируется `/1c-init`).
* `pi-1c-agent-upstream/` — публичный клон <https://github.com/comol/ai_rules_1c.git>.
* `.dev.env` — секреты проектов (см. `.dev.env.example` пакета `pi-1c-agent`).

## Развёртывание на новой машине

1. Клонировать репозиторий в место профиля, например
   `git clone <repo-url> C:\DevopsMoments\pi-agents\config-1c`.
2. Восстановить локальные файлы:
   `copy auth.example.json auth.json` и `copy trust.example.json trust.json`,
   затем вписать свои ключи и доверенные пути.
3. Установить рантайм (node + Pi CLI + `rg`/`fd`) — скриптами из `pi-agents`
   (`scripts\install-pi-agents.ps1`) или вручную в `node/`, `npm/`, `bin/`.
4. Задать переменные окружения: `PI_CODING_AGENT_DIR=<путь клона>`,
   `PI_CODING_AGENT_SESSION_DIR`, `PI_CONFIG`, `PI_CLI`, `PI_NODE`.
5. Скачать снимок upstream:
   `git clone https://github.com/comol/ai_rules_1c.git pi-1c-agent-upstream`.
6. Для `mcp.json` нужны переменные `KNOWLEDGE_MCP_URL`, `KNOWLEDGE_MCP_AUTHORIZATION`
   (остальные 1C-MCP — локальные порты 8002–8008).
7. Проверить: запустить Pi и выполнить `/1c-doctor`.

## Замечания

* `settings.json` и `1c/bootstrap.manifest.json` содержат абсолютные пути —
  на другой машине их нужно поправить (или перегенерировать bootstrap-ом).
* Идентичность коммитов настраивается локально:
  `git config user.name "<name>"` и `git config user.email "<email>"`
  (в этом репозитории по умолчанию `Zap <zap@localhost>`).
* Секреты никогда не коммитить: перед `git add` проверять `git status`
  и `git diff --cached`.
