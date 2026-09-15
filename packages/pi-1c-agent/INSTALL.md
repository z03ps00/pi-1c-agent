# INSTALL — Pi 1C Agent v0.6.1

Использовать только с vanilla Pi.

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

`/init` first asks empty scaffold vs dump from IB / `.cf` / `.dt`. `/init` is an alias. `/init advanced`:

1. читает pinned upstream `.dev.env.example`;
2. проверяет drift против UX-схемы 43 текущих переменных;
3. пытается read-only определить Configuration.xml / CompatibilityMode / PLATFORM_PATH / source root;
4. спрашивает переменные последовательно и объясняет смысл каждой;
5. показывает redacted preview;
6. пишет `.dev.env`, `.pi/1c/project.yaml`, `.pi/1c/init-state.json` только после explicit Apply;
7. при согласии инициализирует Configuration Knowledge fingerprint;
8. предлагает `/openspec-setup`, если OpenSpec включён, но native Pi artifacts ещё не созданы.

Для сокращённого onboarding:

```text
/init quick
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
