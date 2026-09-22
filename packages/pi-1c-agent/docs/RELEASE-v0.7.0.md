# Pi 1C Agent v0.7.0

Первый tagged GitHub-релиз профиля для [Pi](https://github.com/badlogic/pi-mono) и разработки на 1С:Предприятие.

**Требования:** Node.js `>=22.19.0`, Pi `0.85.x`.

## Breaking

- Сломанный или отсутствующий режим теперь открывается как **ASK**, не BUILD.
- ASK/PLAN больше не доверяют имени инструмента: `get_and_delete` и подобные запрещены, пока tool не в явном read-only inventory.
- Handoff v2: обязательны `schema: 2`, `runId`, `agent`, `status` и структурированная verification.
- Writer-субагенты в ASK не запускаются; child в ASK не получает `write` / `edit` / `bash`.

## Security

- Секреты из `.dev.env` и известные credential-семьи (AWS, GitLab, npm, …) редактируются до отправки в RouterAI.
- `/approve safe` спрашивает перед любым shell, который не доказан узким read-only allowlist.
- Session-одобрение действует на tool + risk + target, не на всю категорию `bash`.
- Child-процесс наследует allowlist переменных окружения, не весь `process.env`.

## Reliability

- Bounded stdout/stderr без пиковой конкатенации oversized chunk.
- Остановка дерева процессов: POSIX process group / Windows `taskkill /T`.
- Cognee ACK без read-back = `accepted`, не `recorded`.
- При дубликате в очереди памяти побеждает `done`.

## Docs

Корневой README переписан как product guide: режимы, команды, безопасность, session rotation.

Полный список — в [CHANGELOG](../CHANGELOG.md).
