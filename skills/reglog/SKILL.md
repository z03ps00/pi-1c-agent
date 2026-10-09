---
name: reglog
description: "Recent registration-log errors and warnings from the running infobase. Use /reglog. Do not invent a query and do not read the technical log."
---

# Журнал регистрации

Команда `/reglog`. Код запроса лежит в пакете и снаружи не собирается.

Можно передать только предел строк (не больше 64), окно `24h` или `7d` и уровень `error`, `warning` или `both`.

Если команда пишет, что MCP нет, остановись. Не подменяй её своим кодом и не читай технический журнал (`1Cv8*.log`, ClickHouse, rphost).

Пароли и полный путь базы в ответ не копируй. Достаточно вида базы и короткого имени, которые уже напечатала команда.
