## 1. Snapshot extra skill trees

- [x] 1.1 Copy `vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, and `humanizer-ru` from the author Cursor skills (Vanessa/KD/toolkit fallback: `1c-project-scaffold/vendor/`) into `$PI_CODING_AGENT_DIR/skills/<name>/` including docs, references, scripts, and Humanizer `knowledge/` — not EPF/CFE binaries, not the English `humanizer` skill
- [x] 1.2 Add an extra/beta banner to each extra `SKILL.md` (Vanessa/KD: lab-owned beta, not `ai_rules_1c`; Humanizer RU: `Humanizer_RU` snapshot + author overlay, not `ai_rules_1c`)
- [x] 1.3 Rewrite install/path notes that assume `.opencode/skills`, required `_docs/*.md`, or a machine-local folder; point at `$PI_CODING_AGENT_DIR/skills/…` and project `.dev.env`
- [x] 1.4 Grep the five trees for required `/home/`, `/mnt/vol_`, `C:/Users/` paths and replace with env placeholders or relative paths

## 2. Lab extras register (not ai_rules_1c)

- [x] 2.1 Add append-only `LAB-EXTRAS.md` with a baseline section: date, source, extra/beta status, the five trees
- [x] 2.2 Add `lab-extras.lock.json` with extra/beta status, snapshot date, and source id per tree (Humanizer MAY record a `Humanizer_RU` SHA; never an `ai_rules_1c` SHA)
- [x] 2.3 Document the refresh procedure in `LAB-EXTRAS.md`: copy workshop → profile skills, append register, do not touch `UPSTREAM-REGISTER.md` / `upstream.lock.json` / `/review-airules`
- [x] 2.4 Update `prompts/review-airules.md` with one line: extra trees including `humanizer-ru` are out of scope

## 3. Cross-platform toolkit scripts

- [x] 3.1 Keep bash `scripts/*.sh` for toolkit/KD2/KD31 (port from env, JSON file for Cyrillic)
- [x] 3.2 Add PowerShell twins (or equivalent documented Windows HTTP) for health / query / exec that read `MCP_TOOLKIT_PORT`, `KD2_PORT`, `KD31_PORT`
- [x] 3.3 Point extra skills at `powershell-windows` for Windows invocation

## 4. MCP and env (opt-in)

- [x] 4.1 Add `mcp.optional/vanessa.json` using `${VANESSA_MCP_URL}` (or equivalent); do not merge it into default `mcp.json`
- [x] 4.2 Update `mcp.optional/README.md` and `mcp.example.json` comments so Vanessa is listed as a separate family, not part of the 1C bundle
- [x] 4.3 Add a profile extras snippet for `.dev.env` keys `VANESSA_MCP_URL`, `MCP_TOOLKIT_PORT`, `KD2_PORT`, `KD31_PORT` — do not patch the `ai_rules_1c` `.dev.env.example`
- [x] 4.4 Confirm toolkit ports and Humanizer are never registered as MCP servers

## 5. Init extras (project data only)

- [x] 5.1 Extend `prompts/init.md` and `rules-1c/core/project-init.md`: ask Vanessa yes/no, KD none/2/3/both, Humanizer RU yes/no; silence is not Yes; Apply writes dirs + env keys for Vanessa/KD and only a preference flag for Humanizer
- [x] 5.2 Vanessa=yes Apply: create `tests/features/` (and documented companion dirs); do not copy the skill; do not download EPF/CFE unless the user confirmed binaries in this run
- [x] 5.3 KD≠none Apply: create `tools/mcp-toolkit/`; append missing port keys; do not copy skills; do not download `MCP_Toolkit.epf` unless confirmed
- [x] 5.4 Humanizer=yes Apply: record auto-use preference only; do not copy the skill; do not install the Python linter unless the user asked
- [x] 5.5 Vanessa=no / KD=none / Humanizer=no: do not create those dirs, keys, or auto-use flag
- [x] 5.6 Document later-enable without full `/init` (settings / extras re-ask / first-use consent) for Vanessa, KD, and Humanizer

## 6. Commands and doctor

- [x] 6.1 Add settings prompt `install-vanessa-mcp.md` (ask URL, merge fragment, not everyday). Add `/1c-install-vanessa-mcp` alias stub only if aliases are still in the window
- [x] 6.2 Update `prompts/installtools.md`: Vanessa MCP as an extra row; `recommended` does not preselect it; toolkit/KD/Humanizer are not MCP menu items
- [x] 6.3 Update `prompts/checkmcp.md`: absent Vanessa = `not configured`; toolkit HTTP and Humanizer are not MCP failures
- [x] 6.4 Update `prompts/CATALOG.md` settings table only (no new everyday verb)
- [x] 6.5 Update `prompts/doctor.md`: WARN if extra skill trees missing (five trees); FAIL CORE if extras hardcode machine paths; CORE still passes when Vanessa MCP is not configured

## 7. Agent routing

- [x] 7.1 Update `agents/1c-tester.md`: Vanessa `.feature` → `vanessa-mcp`; web client → existing `UI_TESTING` browser path; do not substitute one for the other
- [x] 7.2 Point `1c-developer` / `1c-planner` (and pipeline if needed) at `kd2-rules` / `kd31-rules` / `1c-mcp-toolkit` for КД tasks
- [x] 7.3 Point `1c-doc-writer` (and overlay) at `humanizer-ru` for Russian «очеловечь» / канцелярит; do not use English `humanizer` for those requests; do not auto-run on ordinary BSL
- [x] 7.4 Add `mcp-1c-tools` rows: Vanessa MCP is a different class than `1c-data-mcp`; toolkit HTTP is the KD transport; data-MCP fallback only on explicit accept
- [x] 7.5 Overlay `AGENTS.md`: one paragraph on extras (global skills, init extras, later enable, not `ai_rules_1c`)

## 8. Docs

- [x] 8.1 README: extras section (beta/owner, Humanizer_RU separate, refresh, not `ai_rules_1c`)
- [x] 8.2 NOTICE: third-party ancestry (Vanessa Automation, neurofish MCP, ROCTUP toolkit, Desko77 MIT text, Comol `Humanizer_RU`) vs lab-owned Vanessa/KD extra
- [x] 8.3 `prompts/init.md` / README: selected extras install on Apply as project data or a preference flag, not as a follow-up skill copy; declined extras can be enabled later

## 9. Verification

- [x] 9.1 Grep: default `mcp.json` still has no Vanessa, toolkit, knowledge, memory, or 8002–8008
- [x] 9.2 Grep: `/review-airules` does not install extra skills; `LAB-EXTRAS.md` exists; `UPSTREAM-REGISTER.md` has no Vanessa/KD/Humanizer baseline rewrite
- [x] 9.3 Grep: five `SKILL.md` files exist under profile `skills/` with extra/beta banner; `humanizer-ru` includes `knowledge/`; English `humanizer` was not copied; no required `/mnt/vol_` / `/home/<user>/` in those trees
- [x] 9.4 Read `/init` and `/installtools`: Vanessa/KD/Humanizer questions exist; silence is No; later-enable is documented; `recommended` does not preselect Vanessa MCP
- [x] 9.5 Read `1c-tester.md` and `1c-doc-writer.md`: Vanessa vs browser split is explicit; Humanizer RU is the Russian editor path
- [x] 9.6 If any required check fails: fix, then re-run 9.1–9.5
