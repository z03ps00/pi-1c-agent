# ACP для Pi 1C

`scripts/pi-1c-acp` — процесс, с которым другой агент говорит по [Agent Client Protocol](https://agentclientprotocol.com/protocol/v1/overview) v1: JSON-RPC, одна запись на строку, stdin и stdout. Stdout занят только протоколом. HTTP-порт не открывается.

Лаунчер ставит `PI_CODING_AGENT_DIR` на этот профиль и поднимает `pi --mode rpc --1c-mode ask`. Слэш-команды и инструменты — те же расширения `1c-*`. Каталог проекта приходит в `session/new` (`cwd`).

Один процесс — одна сессия. Задача — `session/prompt` с текстом. `/doctor` и `/mode build` уходят в Pi как есть. Остановка — `session/cancel`. Режимы сессии: `ask`, `plan`, `build`. Пустой `/mode` и другие оверлеи сразу отменяются: в ответе будет просьба передать аргумент, например `/init from-cfe`.

Встроенное имя OpenClaw `pi` запускает обычный Pi (`npx pi-acp`), не этот профиль. Для Pi 1C нужна отдельная строка `pi-1c` и то же имя в `acp.allowedAgents`. Путь к лаунчеру абсолютный.

```json
{
  "plugins": {
    "entries": {
      "acpx": {
        "config": {
          "agents": {
            "pi-1c": {
              "command": "<profile>/scripts/pi-1c-acp"
            }
          }
        }
      }
    }
  },
  "acp": {
    "allowedAgents": ["pi-1c"]
  }
}
```

После записи OpenClaw делегирует задачу так: `/acp spawn pi-1c` или `sessions_spawn({ runtime: "acp", agentId: "pi-1c", task: "..." })`.
