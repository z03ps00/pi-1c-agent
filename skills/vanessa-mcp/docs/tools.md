# Vanessa MCP — tool catalog

Full tool set from the official Vanessa Automation docs, branch `develop`
([`docs/AI/index.md`](https://github.com/Pr-Mex/vanessa-automation/blob/develop/docs/AI/index.md)),
grouped by workflow phase. Baseline names are **snake_case**. If the current
session exposes a tool under a different name, **call the live name** and add it
to the "Live alias" column here — the session schema is the final authority.

There is **no** `connect_test_client` tool: connect via `manage_test_client`
with `action=connect`. The `get_VanessaAutomation_state` alias seen in an older
session was not reproduced and contradicts both the develop docs and
[`docs/integration.md`](integration.md); use `get_vanessa_automation_state` unless the
live schema says otherwise.

| Baseline name | Live alias (fill from session) | Purpose / key params |
|---|---|---|

## 1. State & context

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `get_vanessa_automation_state` | | Current VA state (Markdown): is a scenario running, current feature (name/path/language/tags), current scenario, current step, **is the test client connected**. Call before writing/analysing tests. |
| `get_editor_state` | | Monaco editor state: open tabs, active document content, cursor position, errors. If a feature is loaded you can already `run_scenario`. |
| `get_environment_data` | | Environment: current date/time, 1C platform version, OS, VA variant (regular / Single), whether VanessaExt is enabled, which IB runs the test manager. |
| `get_extension_list` | | Extensions installed in the **test client** (client must be connected): Name, Version, Purpose; flags Active, SafeMode. |

## 2. Test client

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `manage_test_client` | | Manage the 1C test client. `action=connect` + **`profileName`** to connect; `action=disconnect` to disconnect (profileName optional). |
| `manage_test_client_profiles` | | Profiles table. `action`: `get_list` (list all profiles), `add`, `edit`. For add/edit: `name` (req), `synonym`, `infobase_path`, `additional_parameters`, `client_type` (Тонкий / Толстый / Web / …), `computer_name`. |
| `close_test_client` | | Close a test-client session by profile name; no name = current profile. |

## 3. Step library (find steps — never invent)

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `search_for_steps_by_keywords` | | Search library steps (Markdown). Params `search_name`, `search_description`, `search_type` and their `exclude_*` twins; each accepts several values separated by `\|` (e.g. `search_name="кнопка\|кнопку"`). |
| `frequently_used_steps` | | Steps ordered by usage frequency across large projects; returns step presentation, description, type, and the total step count. |
| `get_info_about_line_scenario` | | Detailed info about a given line of the file open in the editor; if the line is a step — full step info. |
| `get_data_from_knowledge_base` | | Q&A knowledge base (frequent questions and fixes). Fetch in portions to save tokens; can search questions/answers case-insensitively. |
| `select_step` | | Make a step current by line number (prep for `run_scenario` mode `fromCurrentStep`). |
| `select_scenario` | | Make a scenario current by name (prep for `run_scenario` mode `selected`). |

## 4. Feature editing & running

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `open_feature_file` | | Open a `.feature` in Vanessa Editor (or activate its tab). **`filePath`** required. Use before `check_syntax` / `execute_feature_step` / manual editor navigation. |
| `load_features` | | Reload `.feature` files from disk after you edited them. Best way to re-read the current file into VA. |
| `check_syntax` | | Gherkin syntax check of a feature file. **`filePath`** required. Returns Markdown with unknown steps, structural problems, keyword errors. |
| `run_scenario` | | Run scenarios; streams `step N/M`, returns the final result. `filePath` loads+opens+runs the file. Modes: `all` (default), `reloadAndRun`, `selected` (after `select_scenario`), `fromCurrentStep` (after `select_step`), `reloadAndRunFromLine` (+ `lineNumber`). |
| `stop_scenario` | | Ask VA to stop execution (may take time). |
| `execute_feature_step` | | Execute one step of an open file by line number (validates the file is open, activates the tab). |
| `manage_breakpoints` | | Breakpoints in Gherkin scenarios. `action`: `toggle` (default), `remove_all`, `list`. |
| `manage_variables` | | Test-context variables. `action`: `get` (default), `set`, `delete`. Local vars reset before each scenario; global vars live while VA runs. |

## 5. Run results

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `get_test_results` | | Detailed run results: per-step status, timing, errors. No `scenarioId` = last scenario. This is the source for the fail-fix loop. |

## 6. Windows & screenshots

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `get_window_list_testclient` | | Inner windows of the test client. Use for `window_management` (activate/close/open navigation) or `get_active_window_data`. **Not** for OS screenshots — inner windows ≠ OS windows. |
| `get_active_window_data` | | Active inner-window properties by `type`: `window_caption` (title — the smoke-assertion source), `navigation_link`, `form_name`, `form_caption`. |
| `window_management` | | Manage test-client windows. `action`: `activate` (+ `window_title`, `*` wildcards allowed), `close` (+ `window_title`), `open_navigation` (+ `navigation_link`). |
| `get_window_list_os` | | OS-level window list — call **before** `get_window_screenshot_os`. |
| `get_window_screenshot_os` | | Screenshot of a test-client window for vision analysis. **`window_title`** required; `color_mode` = `grayscale` (default) / `color`. Needs the client connected (else it tells you to `manage_test_client action=connect`). |

## 7. Form / UI interaction

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `get_form_analysis` | | Current tested-form info: element tree or state as Gherkin steps. Client must be connected. Watch element/group Visibility — a visible element inside an invisible group is not usable. |
| `get_form_element_data` | | Data of one form element (Markdown): Name, Title, Type, Kind, Value, Presentation; flags Visibility, Availability, ReadOnly. **`element_name`** required. |
| `get_object_attributes` | | Attributes (and types) of the object behind an open **object** form (catalogs/documents; not lists/service forms). `data_mode`: `all` / `attributes_only` / `single_attribute` (+ `attribute_name`) / `tabular_sections_only` / `single_tabular_section` (+ `tabular_section_name`); `only_filled` true/false. |
| `manage_form_elements` | | Universal form-element control. `action` ∈ {click_button, input_text, set_value, open_dropdown, select_from_dropdown, set_checkbox/unset/toggle, set_radio_button, click_hyperlink, switch_tab, toggle_group, create_new, clear_field, table navigation (navigate_to_row/next/previous, start_edit_row/end_edit_row, select_row, get_selected_rows), …}. Common params: `element_name`, `value`, `table_name`. Client must be connected. |
| `execute_form_actions` | | Run a **sequence** of form actions in one call. **`actions_json`** (JSON array); each item: `action`, `element_name`, `table_name?`, `value?`, … Stops on first error. Client must be connected. |
| `manage_command_interface` | | 1C command interface. `action`: `get_section_panel`, `get_function_panel`, `click_section_panel` (+ `command`, `returnFunctionPanel?`), `click_function_panel` (+ `command`, `group?`), `close_function_panel`, `get_all`. After `click_function_panel` verify the opened window via `get_window_list_testclient`. |

## 8. Data, recording, misc

| Baseline name | Live alias | Purpose / key params |
|---|---|---|
| `get_table_data` | | Read DB table data to understand existing test data. `object_type`: 1 Справочник, 2 Документ, 3 Перечисление, 4 one const, 5 all consts, 6 attrs by nav link, 7 ПВХ, 8–11 list all of a kind. `object_name` (req for 1–4,7), `limit` (def 10), `name_filter` + `name_match_type` (exact/partial/starts_with), `date_start`/`date_end`, `navigationLink`. |
| `save_table_document_to_file` | | Save a table document element to disk. `file_name` (req, full path), `format` mxl/xlsx/pdf (def mxl), `form_element_name` (req). |
| `user_actions_recording` | | Record user actions in the test client. `action`: `start` (default), `stop` (returns the recorded Turbo Gherkin steps). Client must be connected. Use for the research phase to draft steps. |
| `voice_notification` | | Voice notification via VanessaExt — useful when the agent runs in a separate VM on a long task (done / needs a decision / error). |
