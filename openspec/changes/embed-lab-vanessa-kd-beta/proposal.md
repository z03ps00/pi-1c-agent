## Why

Vanessa Automation scenarios, Конвертация данных 2/3, and Humanizer RU already have working Cursor skills, but the Pi 1C profile does not ship them. Without that, Pi can write BSL and drive a web client, yet it cannot author `.feature` tests, live KD exchange rules, or edit Russian AI prose. Vanessa/KD are lab beta extras owned by this profile’s author. Humanizer RU is the Cursor snapshot of Comol’s separate `Humanizer_RU` product plus the author’s `knowledge/` overlay — still not `comol/ai_rules_1c`. All of them will still change, so they need their own install, attribution, and refresh path.

## What Changes

- Copy the extra skill trees into the **global** Pi profile: `vanessa-mcp`, `kd2-rules`, `kd31-rules`, the KD transport `1c-mcp-toolkit`, and `humanizer-ru` (Cursor tree including `knowledge/` and `references/`). Do not copy the English `humanizer` skill.
- Mark Vanessa/KD trees as **beta** (may grow or change). Humanizer RU is a pinned snapshot of another Comol product plus author overlay; it still stays out of `/review-airules` for `ai_rules_1c`, `UPSTREAM-REGISTER.md`, and Comol `install.ps1`.
- Teach `/init` to ask Vanessa / КД 2 / КД 3 / Humanizer RU as extras. Silence is No. On Apply, write only **project data** (dirs and `.dev.env` keys for Vanessa/KD; a project preference flag for Humanizer). Do not copy skills into the 1C project. Declined extras can be enabled later without a full re-init.
- Register Vanessa Automation MCP as an **opt-in** fragment. Do not put it in default `mcp.json`. MCP Toolkit stays HTTP via EPF, not a default MCP server.
- Route work: Vanessa Gherkin → `vanessa-mcp`; web-client browser tests stay on `1c-tester` + `UI_TESTING`; KD rules → `kd2-rules` / `kd31-rules` over `1c-mcp-toolkit`; «очеловечь» / Russian prose edit → `humanizer-ru` (not the English `humanizer`).
- Document a refresh path from the author’s working copy (today Cursor `~/.cursor/skills`) into `$PI_CODING_AGENT_DIR/skills/`, so later beta updates do not wait on Comol.

**Not breaking** for existing 1C coding commands. Default MCP set stays empty. Everyday catalog stays at the current twelve verbs.

## Capabilities

### New Capabilities

- `lab-extras-lifecycle`: ownership, beta stamp, isolation from `ai_rules_1c`, global-vs-project install, later enable, refresh without `/review-airules`
- `vanessa-scenario-protocol`: Vanessa skill, MCP opt-in, write/run loop, tester routing vs browser UI
- `kd-exchange-toolkit`: MCP Toolkit HTTP API plus KD 2.0 XML rules and KD 3.1 EnterpriseData skills, ports in `.dev.env`
- `humanizer-ru-editor`: Russian AI-prose editor skill, fact lock, on-request vs project preference, no project copy

### Modified Capabilities

- none (main `openspec/specs/` is still empty; productize deltas stay in that change)

## Impact

- This git profile: `skills/{vanessa-mcp,kd2-rules,kd31-rules,1c-mcp-toolkit,humanizer-ru}/`, `AGENTS.md`, `README.md`, `NOTICE` (lab extras vs `ai_rules_1c`; Humanizer_RU called out separately), `prompts/init.md`, `prompts/installtools.md`, `prompts/CATALOG.md`, `prompts/doctor.md`, `prompts/checkmcp.md`, `mcp.optional/` (Vanessa fragment only), `agents/1c-tester.md` (and developer/planner/doc-writer pointers), `rules-1c/core/project-init.md`, a lab extras register (not `UPSTREAM-REGISTER.md`), `skills/mcp-1c-tools` routing rows.
- Target container: the **Pi 1C profile**, not a 1C CFE/CF. Downstream 1C projects receive dirs and `.dev.env` keys only (Vanessa/KD) or a preference flag (Humanizer). No skill copies into the project.
- Source of the first snapshot: the author’s Cursor skills (`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru`). `1c-project-scaffold` is a Cursor/OpenCode installer, not copied wholesale.
- Upstream: Pr-Mex Vanessa MCP docs, neurofish `client_mcp.cfe`, ROCTUP `MCP_Toolkit.epf`, Desko77 MIT skill text, Comol `Humanizer_RU` (separate from `ai_rules_1c`) — none of these become the `ai_rules_1c` pin.
- Dual host: Pi loads profile `skills/`; Cursor may keep `~/.cursor/skills` as the beta working tree until a refresh copies into the profile.
