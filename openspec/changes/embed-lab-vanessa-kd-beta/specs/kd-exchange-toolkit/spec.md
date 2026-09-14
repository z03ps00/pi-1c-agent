## Purpose

Defines how the Pi 1C agent talks to a live Конвертация данных infobase through MCP Toolkit HTTP and authors KD 2.0 XML exchange rules or KD 3.1 EnterpriseData rules as lab beta extras.

## ADDED Requirements

### Requirement: Three profile skills cover toolkit, KD 2, and KD 3

The profile MUST ship `1c-mcp-toolkit` as the HTTP transport skill, `kd2-rules` for Конвертация данных 2.0/2.1 XML rules (ПКО, ПКС, ПКЗ, ПВД, XML for Универсальный обмен), and `kd31-rules` for Конвертация данных 3.1 EnterpriseData (ПКО `_Отправка`/`_Получение`, ПКС, ПОД, format extension, exchange manager module). Skill descriptions MUST trigger on КД 2 / КД 3 / EnterpriseData / MCP Toolkit / live IB without `hs/mcp` publish.

#### Scenario: User asks for KD 2 conversion rules

- **WHEN** the user asks to create or edit КД 2.0/2.1 правила конвертации or to unload XML exchange rules
- **THEN** the agent loads `kd2-rules` and uses `1c-mcp-toolkit` as transport, not `kd31-rules`

#### Scenario: User asks for EnterpriseData / КД 3.1

- **WHEN** the user asks about КД 3.1, EnterpriseData, `ОбменДаннымиXDTO`, or generating the exchange manager module
- **THEN** the agent loads `kd31-rules` and does not try to unload KD 2 XML as the result

### Requirement: Ports come from project env, not from chat guesses

When `MCP_TOOLKIT_PORT`, `KD2_PORT`, or `KD31_PORT` is set in the project `.dev.env` (or an equivalent documented project map), the agent MUST probe those ports and MUST NOT re-ask the port. If nothing answers, the agent MUST tell the user to open `MCP_Toolkit.epf` in a thin/thick client of a **copy** of the KD infobase, and MUST NOT start 1C for the user. Health probe MUST be the first recovery step on connection refused.

#### Scenario: KD2_PORT is already set

- **WHEN** `.dev.env` contains `KD2_PORT=7003` and the user asks to list conversions
- **THEN** the agent calls the toolkit on that port without asking which port to use

#### Scenario: Toolkit is down

- **WHEN** the health probe fails on the configured ports
- **THEN** the agent reports that the EPF server is not running and does not invent query results

### Requirement: Toolkit is not a default MCP server

MCP Toolkit MUST remain an HTTP API started from `MCP_Toolkit.epf` in a live 1C session. Default profile `mcp.json` MUST NOT register toolkit ports. `/installtools` `recommended` MUST NOT preselect toolkit or KD extras. Unconfigured toolkit MUST be `not configured` in `/checkmcp`, not a CORE failure.

#### Scenario: Fresh profile has no toolkit MCP entry

- **WHEN** a user deploys the default profile
- **THEN** `mcp.json` has no MCP Toolkit URL and no KD ports

#### Scenario: Data MCP is not a silent substitute

- **WHEN** toolkit does not answer and `1c-data-mcp` is exposed
- **THEN** the agent does not switch to `vcexecutequery` / `vcexecutecode` unless the user explicitly accepts that fallback; the default remains toolkit

### Requirement: Writes require an unlocked toolkit and a non-production IB

Creating or changing KD catalog objects MUST require write protection to be off in the toolkit form for the blocked verbs the skill documents (`Записать`, `Удалить`, `УстановитьПривилегированныйРежим` as applicable). The agent MUST prefer a test copy of the KD infobase and MUST NOT treat a production KD base as the default target. One-off BSL MUST go to a project temp dir the skill names, not into `src/`.

#### Scenario: Write blocked by toolkit protection

- **WHEN** `execute_code` fails because write keywords are blocked
- **THEN** the agent tells the user to clear those flags in the toolkit form and does not claim the rule was saved

#### Scenario: Production base is not assumed

- **WHEN** the user has not named the KD infobase
- **THEN** the agent asks for a test copy / configured KD path and does not write into an unnamed live production base

### Requirement: Helpers and verified object model beat invented BSL

For KD catalog reads and writes the agent MUST use the skill reference helpers and the verified object model in that skill (owner links, denormalized name/type fields, KD 3.1 top-level PКО vs `СоставыКонвертаций`) instead of inventing scripts. Query syntax MAY be checked with the existing syntax MCP when that server is opted in. Cyrillic toolkit responses MUST be read from a file when the terminal would corrupt them.

#### Scenario: New PКО uses the helper pattern

- **WHEN** the agent creates a KD 2 PКО
- **THEN** the script follows `kd2-rules` helpers (owner = conversion, source/destination objects filled, denormalized type fields set) rather than a guessed catalog layout

#### Scenario: KD 3.1 PКО identity is code, not name

- **WHEN** the agent looks up a KD 3.1 PКО
- **THEN** it uses the skill’s verified identity (code / `_Отправка`+`_Получение` pattern), not `НайтиПоНаименованию` as if it were KD 2

### Requirement: Init extra for KD is project data only

`/init` MUST ask whether the project needs Конвертация данных: none, KD 2, KD 3, or both. Silence MUST NOT be Yes. On a non-none answer and Apply, the project MUST receive `tools/mcp-toolkit/` (for the EPF the user will download or already has) and the matching `.dev.env` port keys if absent. The EPF binary MUST NOT be downloaded unless the user explicitly confirmed that extra in this run. Skills stay in the global profile.

#### Scenario: User declines KD

- **WHEN** the user answers 0 / none to the KD extra
- **THEN** Apply does not create `tools/mcp-toolkit` and does not append KD port keys

#### Scenario: User picks KD 2 and KD 3

- **WHEN** the user picks both and Apply runs
- **THEN** `.dev.env` has `MCP_TOOLKIT_PORT`, `KD2_PORT`, and `KD31_PORT` if they were missing, and both KD skills remain available from the profile

#### Scenario: KD enabled later

- **WHEN** the project declined KD at init and later the user consents to enable KD 2, KD 3, or both
- **THEN** the agent writes `tools/mcp-toolkit/` and the matching port keys without re-running the rest of `/init`

### Requirement: Scripts run on Windows and POSIX

Toolkit and KD helper scripts MUST be usable on Windows PowerShell and on bash. The agent MUST follow the profile `powershell-windows` skill on Windows (no `&&` on Windows PowerShell 5.1; prefer native HTTP where `curl` is ambiguous). Scripts MUST take the port from the environment and MUST NOT embed a machine-local folder as a required path.

#### Scenario: Windows host runs a query

- **WHEN** the agent runs a KD query on Windows PowerShell
- **THEN** the call uses the documented Windows-safe invocation and `KD2_PORT` / `KD31_PORT` from `.dev.env`

#### Scenario: Linux host runs the same query

- **WHEN** the agent runs a KD query on Linux
- **THEN** the bash helper uses the same env keys and writes JSON output to a file when Cyrillic must be preserved

### Requirement: Vanessa and KD transports stay separate

A KD task MUST use MCP Toolkit HTTP (or the explicit data-MCP fallback). A Vanessa scenario MUST use Vanessa Automation MCP. The agent MUST NOT send Gherkin to toolkit `execute_code`, and MUST NOT author KD catalog objects through Vanessa.

#### Scenario: Mixed request is split

- **WHEN** the user asks to add a KD 2 PКО and also write a Vanessa scenario for the destination configuration
- **THEN** KD work goes through toolkit/KD skills and the scenario through `vanessa-mcp`, with two distinct preflights
