---
name: 1c-qa-testing
description: "UI checks in the 1C thin client through QA MCP (`1c-qa`, `qa_*` / `ui_*`): session, observe → act → assert, platform behaviour, unknown outcomes, journal and verdicts. Main UI route when connected and TOOL_QA allows it; the web client is the fallback."
argument-hint: "<feature or scenario to check>"
---

# 1c-qa-testing — UI checks through QA MCP

> **Platform.** `scripts/qa-testclient.ps1` drives the Windows 1C test client. On Linux it documents the path; it is not a runnable check unless a Windows client is available.

QA MCP (connection `1c-qa`) is the 1C test manager: it connects to a 1C test client (`/TestClient`) and drives its forms through the platform testing model — windows, fields, tables, commands, messages. It reads structured state, not pixels, so it is the main route for checking behaviour in the 1C interface. The web client (`rules-1c/rules/ui-testing-tools.md`) is the fallback.

## When this route applies

All of these hold:

- `UI_TESTING` allows the check (`rules-1c/rules/dev-standards-env.md → UI_TESTING`): `essential` / `auto` after the change reached the dev/test infobase, `manual` on an explicit request, never under `off`.
- `TOOL_QA` is not `off` (`rules-1c/rules/mcp-policy.md → Tool availability`).
- The `qa_*` / `ui_*` tools are exposed in this session and `qa_status` answers. A config entry or `/healthz` proves nothing.
- The target is an authorized dev/test infobase (`INFOBASE_ROLE`), the one in `.dev.env`.

Otherwise use the web fallback of `ui-testing-tools.md`, or report the check unrun with the reason. `TOOL_QA=required` with the server missing blocks the check; the web client does not replace it.

**Before the first action load `rules-1c/rules/qa-testclient.md`.** It owns what the server does not do: starting and stopping the test client, visible or hidden window, screenshots, Windows-MCP, and confirming data through `1c-data-mcp`. Tool argument names come from the exposed schemas; `qa_playbook` returns the sequence for the current executor.

## Other MCP servers in a check

QA MCP sees only what the test client shows. Use the other 1C servers wherever they answer a question of the check faster or more reliably, under the same `TOOL_*` policy and `rules-1c/rules/mcp-policy.md` (read before the first 1C MCP call):

- **What to open and what it is called** — `skills/1c-meta-info/SKILL.md` (graph / code metadata): the object's exact metadata name for `ui_open(kind=, metadata_name=)`, its synonym (the title the client shows), attributes, tabular parts, commands, subsystems.
- **Which form and which elements** — `skills/1c-form-inspect/SKILL.md`: the forms of the object, the default form, element names and groups before the first `ui_window_tree`. Form code that substitutes another form (`ОбработкаПолученияФормы`) or changes elements on open is found through `skills/1c-code-search/SKILL.md`.
- **Where the effect lands** — `skills/1c-impact/SKILL.md`: registers a document writes, subscriptions and handlers a command runs; this tells which data to confirm afterwards.
- **Code behind an error** — after `ui_errors` names a module and line, read that code through `1c-code-search`.
- **Data** — `1c-data-mcp` (`skills/1c-live-ib/SKILL.md`), read-only: existing test data to use (an employee, a document number, a catalog item), and the data effect of a step (`qa-testclient.md → Confirming data through 1c-data-mcp`).

Metadata indexes describe the project sources; use them only when they cover the configuration loaded into the tested infobase (the same project, fresh after the change). The live window wins: names from an index are candidates until `ui_window_tree` / `ui_find` shows them.

## Session

1. `qa_status` — the executor decides who starts 1C:

   | `executor` | What it is | Test client |
   |---|---|---|
   | `native` | The container is the test manager and speaks the test-client protocol; no 1C platform inside | The agent starts it by `qa-testclient.md`; the server only connects |
   | `platform` | Windows manager next to the platform | `qa_start` starts it itself |

2. Start or find the test client (`qa-testclient.md`), then `qa_start(connection="<session name>")`; `port=` overrides the port of `MCP_QA_TESTCLIENT`. No Windows account is needed: the test client accepts the channel's Windows authentication from any identity (8.3.27.2130); the 1C sign-in happens when the client starts.
3. `qa_status` again: executor, link, target. A `test client is already connected to another manager` answer means another agent owns the client — a conflict to resolve, not a client to close.
4. At the end: `qa_stop`. In `native` it only disconnects; the client is closed by the tool that started it (`qa-testclient.md`). A new MCP session or a restarted client needs a new `qa_start`; `save_as` aliases and `ui_here` pins do not survive it.

After `/update1cbase`, `/deploy-and-test` or `/restore-testbase` the update ends the sessions of the infobase: a client started before it is stale. Start a fresh client, `qa_start`, and read the main window before the first step.

## Observe → act → read the change → assert

1. Read before acting: `ui_active_window`, then `ui_window_tree(detail="lite")` or `ui_inspect`. Use the names and paths they return; never invent element names.
2. One purposeful action: `ui_open`, `ui_click`, `ui_set` / `ui_input`, `ui_field`, `ui_table`, `ui_list`, `ui_command`, `ui_dialog`, `ui_form`.
3. Read the result: `ui_window_changes`, `ui_wait` (form, element or closing), `ui_messages`, `ui_errors`.
4. Assert on read values: `ui_get_text`, `ui_find`, table rows from `ui_table` / `ui_list`. A command accepted is not an effect observed.
5. Re-read the window after navigation, a closed form or anything that invalidates the tree; earlier snapshots and `ui_here` pins are stale then.

The first form may still be loading right after the client starts: repeat read-only reads within a bounded wait.

### Forms

- `ui_open(kind=, metadata_name=)` without `form_name` opens and recognises the default form, including one defined in the configuration (`Вид.Объект.Форма.<Имя>`). When the configuration opens another form instead (ZUP: the employee list is a data-processor form), the single new form is accepted and the answer carries `substituted_for`. A failed open lists the forms that did appear. `ui_open(link="e1cib/…", target_title=…)` opens by navigation link.
- `e1cib/data/<Type>.<Name>` without `?ref` opens a new object; the auto-generated object form is `<Type>.<Name>.ФормаОбъекта`, without `.Форма.`.
- `ui_close_form` closes the named form (`form=`, `title=`, `name=`, `form_name=`) or the active non-main window. It never closes the main window and closes nothing when the named form is not found.
- The MCPQAClient extension enables `ui_form_schema`, `qa_data_candidates` and `ui_open` through `ОткрытьФорму`; without it `ui_open` opens forms by navigation link. Installing it is a change of the test infobase (`qa-testclient.md → MCPQAClient extension`).

## Recipes

Call sequences for the frequent actions, run live on server 0.7.9 and platform 8.3.27.2130 (01.10.2026). They hold what the tool descriptions do not say: which calls, in which order, and what in the answer shows the step is done. Names of elements, tables and buttons are examples — take the real ones from the form (`ui_window_tree(detail="lite")`; buttons: `ui_form(action="command_bar")`).

Load a tool schema only for a tool or argument that is not shown here. Where the host loads schemas on demand, ask for the base set in one request: `qa_status`, `qa_start`, `qa_stop`, `ui_open`, `ui_active_window`, `ui_window_tree`, `ui_list`, `ui_table`, `ui_get_text`, `ui_input`, `ui_select`, `ui_click`, `ui_form`, `ui_dialog`, `ui_wait`, `ui_close_form`, `ui_close_all`, `ui_messages`, `ui_errors`.

| Goal | Calls, in order | Done when |
|---|---|---|
| Clean start | `ui_close_all()` | `windows`: the main window and the home page only |
| Open a list | `ui_open(kind="catalog", metadata_name="Организации")` (`kind` in English or Russian, or `metadata_name="Справочник.Организации"` alone) | `opened: true`, `form_name` |
| First item of the list | `ui_table(action="first", name="Список")` → `ui_table(action="select", name="Список")` | `window_after`: `title`, `form_name` of the item form; `url` from `ui_active_window()` when needed |
| Item of a known row | `ui_table(action="select", name="Список", row={"Наименование": "Крон-Ц"})` — the choice is made on the column of `row=` (or `column=`) | same; a missing row is the error «Строка таблицы не найдена», nothing opened |
| Item in a long list | `ui_list(action="search", text="Крон")` → `select` with `row=` as above; `ui_list(action="clear_search")` before the list is used again | the search `rows` hold the row |
| The same object again | `ui_open(link="<url from ui_active_window>", target_form_name="<its form_name>")` | `opened: true` |
| New object | on its list: `ui_table(action="add", name="Список")` | `window_after.title` ends with «(создание)» |
| Read a field | `ui_get_text(name="Наименование")` | `edit_text` |
| Plain field | `ui_input(text="12,5", name="Цена")` → `ui_activate(name="<next field>")` | `value_after`, `verified: true`; `ui_messages()` when the change has checks |
| Reference field | `ui_select(value="Молоко", name="Номенклатура")`; a composite type also needs `data_type=` | `actual` equals the value |
| Row of a tabular section | `ui_table(action="add", name="Товары")` → `ui_select(value="Молоко", name="ТоварыНоменклатура", table="Товары")` → `ui_table(action="input_cell", name="Товары", column="ТоварыКоличество", value="5")` | `value_after`, `verified: true`; `ui_table(action="current", name="Товары")` shows the row |
| Write and stay | `ui_click(name="ФормаЗаписать")` → `ui_active_window()` → `ui_messages()`, `ui_errors()` | title without «(создание)» and « *», `modified: false`, `has_error: false` |
| Write or post and close | `ui_click(name="ФормаЗаписатьИЗакрыть")` (`ФормаПровестиИЗакрыть`) → `ui_wait(form_name="<form_name>", closed=True)` → `ui_messages()` | `closed: true`; a form that stayed open has the reason in the messages or in a question |
| Answer a question | `ui_active_window()` (`form_name: MessageBox`), its text in `ui_window_tree(detail="lite")` → `ui_dialog(title="Нет")` | `clicked: true`, then the window behind it |
| Close a form | `ui_close_form(form_name="<form_name>", on_prompt="discard")` (`save`, `cancel`) | `closed: true`; `blocked_by` names a question left open |

What goes wrong around them:

1. `select`, `edit`, `delete` and `copy` act on the current row unless `row=` is given; then they go to that row first and refuse when it is missing. Reading rows keeps the cursor where it was and answers `current_row` (servers before 0.7.9 left it on the last row read).
2. `ui_table(action="edit")` on a list opens the item form (`window_after`, `editing: false`) — it does not edit the row in place; open items with `select` and never call `end_edit` after it.
3. `kind` values: `catalog`, `document`, `dataProcessor`, `report`, `informationRegister`, `accumulationRegister`, `chartOfCharacteristicTypes`, `chartOfAccounts`, `chartOfCalculationTypes`, `businessProcess`, `task`, `exchangePlan`, `commonForm`, or the Russian name of the kind (before 0.7.9 only the English ones).
4. Form selectors (`target_title`, `title=` of `ui_close_form` and `ui_wait`) compare the whole title, without wildcards, and a modified form's title gets « *». Address a form by `form_name`.
5. Elements are searched in the active window first, then in the whole application. An answer with `found_in` came from a window that is not the active one — a list under the card opened over it: check it is the window you mean.
6. A configuration may hide a standard button and show its own with the same title (`КомандаЗаписатьИЗакрыть` beside a hidden `ФормаЗаписатьИЗакрыть`): take the name from `ui_form(action="command_bar")` or the `lite` tree — both list visible buttons only.
7. `ui_window_tree()` is `lite` by default: visible elements without values, hidden ones counted in `hidden_skipped`. Values and states need `detail="form"`; on a large form that is tens of thousands of characters — read single fields with `ui_get_text` instead.
8. A wrong metadata name or an exception in the form's code ends `ui_open` at once with the error text, and the error window stays open: `ui_dialog(title="OK")`, then take the exact name from the metadata (`1c-meta-info`). `ui_errors` returns the text of an open `ErrorWindow`.
9. `ui_dialog(action="click")` needs `title=` or `name=` of the button; without them nothing is pressed.
10. `ui_set` with text several items start with may leave the choice list open: `dropdown_selected: false`, `dropdown_open: true` — pick with `ui_field(action="dropdown_select", value=…)`. A click while the list is open only closes it.
11. A report after «Сформировать»: an empty `ui_spreadsheet(action="size")` with `state.text` «Отчет формируется...» is not ready — read again after a pause; «Изменились настройки…» means the click did not generate it, click again.

Two attempts one way are the limit. After the second failure read the window (`ui_active_window`, `ui_window_tree(detail="lite")`), then choose another way or report what was reached; do not vary arguments blindly.

## Platform behaviour (8.3.27.2130, measured)

- **Idle link.** The test client drops a manager link that has been silent for 200 s. QA MCP after 0.7.2 and the platform manager keep the link alive; on 0.7.2 and earlier call `qa_reconnect(force=True)` after a pause of more than about 3 minutes. `qa_status` shows a lost link.
- **Typed text is applied when focus leaves the field.** `ui_input` / `ui_set` show the text at once; `OnChange` and its checks run on the next focus move, and their messages arrive with the next action's result. Before asserting a value that depends on the change, move focus (`ui_activate` the next field). Where the server returns `applied`, `value_before`, `value_after` and `verified`, use them; numbers compare as numbers (`100` = `100,00`).
- **A refused input carries its reason in the form messages.** A refusal from form code reaches the test client as a generic error: read `ui_messages` (newer servers append `Form messages: …` to the error).
- **Question or error.** A question or warning is form `MessageBox`; an unhandled exception is `ErrorWindow` titled «1С:Предприятие». After `ErrorWindow` call `ui_errors`: it gives the module, line, source line and cause chain. Newer servers report either window as `window_after`.
- **No message panel.** An empty or `panel_shown: false` answer of `ui_messages` does not prove there were no messages; the panel may have been closed.
- **Deleting in a dynamic list asks first.** `deleted: true` only means the command was accepted; answer the question with `ui_dialog`.
- **Rows are found by displayed text.** A number is matched as the table shows it: `7,000`, not `7`.
- **Tabs.** A table on an inactive tab can be read without switching the tab. `goto` and `select_row` make its tab current. Switch tabs with `ui_activate` on the page group; `ui_click` fails there.
- **A list form may hold several tables.** The main one is not always `Список`: find the tables with `ui_inspect` and pass `table=`.
- **Post / Write may finish later (seen on ERP).** On heavy documents `ui_click` returns once the client accepts the command. Confirm the result before asserting or closing: the title without «(создание)» and «*», the number in the title (`ui_wait` or a new read).

## Unknown outcome

- A timed-out or interrupted action has an unknown outcome: it may have written data. Never repeat a save, post, delete or command blindly.
- Call `qa_command_status` (`channel="client"` for the extension). In `native` a failed link blocks new calls until `qa_command_status` acknowledges it; then `qa_reconnect(force=True)` and read the window (`ui_window_tree`) before deciding.
- A read that times out is not repeated in a loop either; follow the same path.

## Test journal and verdicts

Keep a journal of every check so that another session can continue it after a crash, a lost link or a context reset. A one-off request to open or show something — no change under check, no data written — needs no journal and no screenshot: answer with what was read.

- Where: the task's output directory; otherwise `%TEMP%\qa-runs\<YYYY-MM-DD>-<short name>\journal.md`. Screenshots go next to it. Give the path in the report.
- Write it as you go, after each step:
  - header: scenario, infobase and its role, executor, test-client port, window mode (visible / hidden), start time;
  - per step: number, tool and key arguments, what was observed, verdict, evidence (tool answer or screenshot path);
  - test data the check created (object kind, number or code, key fields, why), written when created;
  - one state line: active window, open dialogs or unsaved changes, whether the client is alive.
- To continue: read the journal, `qa_status` (`qa_reconnect(force=True)` if the link is gone), read the window, go on from the first step without a verdict. Repeat a data-changing step only when the journal and the data show it did not happen.
- Verdict per step: `passed` / `failed` / `not verified`, each with evidence.
  - Evidence: a value read back, an error text from `ui_errors`, the form name of the window that opened, a message text, a data read through `1c-data-mcp`, or a screenshot — whichever shows the result better.
  - An answer that only confirms the command was sent (`clicked`, `added`, `deleted`, `ok`) is not evidence of its effect. A step without evidence is `not verified`, never `passed`.
- Quote messages and error texts verbatim, in the interface language.
- An unplanned refusal that blocks the next steps: record the step `failed` with the text, mark the rest `not verified`, and stop.
- Expected numbers belong in the scenario; a number the agent calculates goes into the journal with the calculation.
- Reuse test data from earlier runs (see the journal) before creating new. Delete test data only when the person asks.

## Not available in `native`

`qa_setup` and `qa_install_client` answer `executor_capability`. `ui_eval` / `qa_run_script` are replaced by `1c-data-mcp`, `ui_screenshot` and the hidden desktop by the Windows side of `qa-testclient.md`. Do not emulate anything else; report the gap. A tool that is missing from the list is not replaced by `ui_eval` or another workaround.

## Report

Use the scenario and report templates of `agents/1c-tester.md`. Name the route (`QA MCP`, executor), the infobase, the journal path, the screenshots by step number, every step whose outcome was not confirmed, and data checks done or not done. Transport success, `/healthz` or a tool list is not a passing check.
