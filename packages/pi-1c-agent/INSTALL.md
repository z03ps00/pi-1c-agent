# INSTALL — Pi 1C Agent v0.8.0

Использовать только с vanilla Pi. Нужен **Node >=22.19.0**.

Operational notes for multi-agent/memory: `docs/multiagent-operations.md`.

## Full install

Global:

```bash
node tools/install.mjs --global
```

Trusted project-local:

```bash
node tools/install.mjs --project
```

С OpenSpec:

```bash
node tools/install.mjs --project --with-openspec
```

Установка package/bootstrap считается успешной только после `CORE: PASS`.

## Recommended project onboarding

После project-local install откройте trusted проект и выполните:

```text
/mode build
/init
```

`/init` empty call opens the overlay: empty scaffold vs existing IB vs `.cf` / `.cfe` / `.dt` (label + description). Then it offers Standard (recommended), Quick, or Detailed. Named `/init from-cfe` skips the picker. `/init` is an alias. `/init standard`:

1. читает pinned upstream `.dev.env.example`;
2. проверяет drift против UX-схемы 43 текущих переменных;
3. собирает несекретные значения из соседних 1С-проектов и автодетект (платформа, Configuration.xml, src);
4. показывает один список настроек с источником каждого значения;
5. ждёт правок и явного «Всё верно» — это и есть подтверждение записи;
6. пишет `.dev.env`, `.pi/1c/project.yaml`, `.pi/1c/init-state.json` (`initMode: standard`) и каркас `.pi/1c/{knowledge,knowledge-drafts,rules}`.

`/init advanced` по-прежнему проходит все переменные по одной. `/init quick` спрашивает только ключевые решения.

Для сокращённого опроса по одной:

```text
/init quick
```

Только каркас знаний в уже существующий 1С-репозиторий (агент не копируется, `.dev.env` не пишется):

```text
/init knowledge
```

Статус:

```text
/init status
/doctor project
```

Секреты (`IB_PASSWORD`, `REPOSITORY_PASSWORD`, `SUPPORT_KEY`) должны быть только DEV/TEST. Они не переносятся в project.yaml, knowledge или отчёты. Pi input может быть видимым; при сомнении оставьте секрет пустым и заполните `.dev.env` вручную локально.

## Configuration Knowledge after initialization

Если Knowledge Layer не был включён в wizard:

1. `/mode build`
2. `/config init <name> :: <version> :: <sourceRoot>`
3. `/mode plan`
4. `/config analyze`
5. review generated draft
6. `/mode build`
7. `/config apply <draft-id>`
8. `/rule audit`

Никогда не активировать knowledge draft автоматически без explicit approval.
