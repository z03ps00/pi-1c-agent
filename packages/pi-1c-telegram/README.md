# Telegram-плагин Pi 1C

Отдельный процесс. Ядро `packages/pi-1c-agent` и панель `scripts/pi-1c-ctl.mjs` он не меняет. В список `packages` файла `settings.json` его добавлять не нужно: это не расширение окна Pi.

Бот сам забирает сообщения у Telegram (long polling) и не открывает входящий порт. С этой машины должен открываться `api.telegram.org`. Процесс не запускают в netns `tunnel-awg-proxy-1`.

## Файлы

Рядом с профилем, не в git:

- `state/telegram/bot.token` — токен Bot API, права `0600`
- `state/telegram/config.json` — скопировать из `config.example.json`

`allowedUserIds` — числовые id Telegram. Пустой список никого не пускает. `allowedRoots` — каталоги, внутри которых можно выбрать проект. `pins` — кнопки каталогов.

## Запуск

```bash
scripts/pi-1c-telegram
```

В чате: проект, статус, модель, сессии, backup, обновление и те же короткие команды, что в Pi (`/mode`, `/approve`, `/init` и остальные). Пустая команда показывает кнопки. Команда с аргументом уходит в сессию сразу.
