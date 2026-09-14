# Vanessa MCP — write & debug loop

The default single-agent loop for authoring and running one `.feature`. Tool
names below are baseline (snake_case); the live session schema wins if it
differs (see [`tools.md`](tools.md)). The МультиАгент orchestrator in the
Vanessa repo is optional and not the default path here.

## 0. Preflight

1. Vanessa MCP tools exposed in the session? If not — stop, tell the user to run «Управление МСР» and reload MCP. Do not fake calls.
2. `get_vanessa_automation_state` — running scenario? current feature? **test client connected?**
3. Client not connected → `manage_test_client_profiles` (`action=get_list`) to read the profile, then `manage_test_client` (`action=connect`, `profileName=Клиент тестирования`).
4. Optional context: `get_environment_data` (platform / VA variant / VanessaExt).

## 1. Research (understand what to test)

- Drive the client manually and let VA record: `user_actions_recording` (`start`) → do the steps in the client → `stop` → returns a Turbo Gherkin **draft**. Treat it as a draft, not final text.
- Navigate via the command interface when needed: `manage_command_interface` (`get_section_panel` → `click_section_panel` → `click_function_panel`), then confirm the opened window with `get_window_list_testclient`.
- Inspect the form under test: `get_form_analysis` (element tree / state as steps), `get_form_element_data` (one element), `get_object_attributes` (object forms). Mind Visibility flags.
- Learn existing data with `get_table_data` before writing steps that assume specific records.

## 2. Steps come from the library (never invent)

For every step, confirm it exists in the Vanessa step library:

- `search_for_steps_by_keywords` — search by `search_name` / `search_description` / `search_type` (values `\|`-separated); use `exclude_*` to filter noise.
- `frequently_used_steps` — common steps first when you are unsure of wording.

Pick the library wording verbatim. Example: a pause is `И Пауза 1`, **not** an invented `И я жду 1 секунду`.

## 3. Write the `.feature`

- Location: `tests/features/` only. Header `# language: ru`; `Функционал:` / `Сценарий:`; Russian step text.
- Reuse the project's real step patterns:
  - `И я закрываю все окна клиентского приложения`
  - `И Пауза 1`
  - `Когда В командном интерфейсе я выбираю "Продажи" "Заказы клиентов"`
  - `Тогда открылось окно "Заказы клиентов"`
  - `И я активизирую окно "Начальная страница"`
- **Window assertions use the inner 1C window title** from `get_window_list_testclient` / `get_active_window_data` (`type=window_caption`) — never the OS application caption (e.g. `Демо-база / Управление торговлей, редакция 11`).

## 4. Syntax check (gate before running)

- `open_feature_file` (`filePath`) → `check_syntax` (`filePath`).
- Any unknown step / structural error → go back to step 2, replace with a real library step, re-check. **A file with unknown steps MUST NOT be run.**
- Zero problems → proceed.

## 5. Run

- `load_features` (re-read your edits from disk) → `run_scenario` (`filePath`, mode `all` by default; `reloadAndRun` / `fromCurrentStep` / `reloadAndRunFromLine` as needed).
- Streams `step N/M`; returns the final status.

## 6. Read result & fail-fix loop

- `get_test_results` — per-step status, timing, error text, the active window at failure.
- On failure, fix by the reported evidence:
  - **Window-title mismatch** → update the expected title to the reported inner window, or insert a matching activate/wait step (`И я активизирую окно "…"`, `И Пауза N`) from the library.
  - **Element not found / not visible** → re-check with `get_form_analysis` / `get_form_element_data` (Visibility), fix element name or add navigation.
  - **Stuck / need a picture** → `get_window_list_os` → `get_window_screenshot_os` (`window_title`) for vision analysis.
- Re-run (step 5). Repeat until status **Success** or a documented blocker (MCP down, client crashed, VA not running). Do **not** claim success without a Success status.

## Checklist before declaring done

- [ ] Vanessa MCP tools were actually exposed and called (no faked calls).
- [ ] Every step is a real library step; `check_syntax` = zero problems.
- [ ] Window assertions use inner titles, not the OS caption.
- [ ] `run_scenario` returned **Success** (or a blocker is written down explicitly).
- [ ] `.feature` is under `tests/features/`; no BSL / metadata / EPF / CFE touched.
