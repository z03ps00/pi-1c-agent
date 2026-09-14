## Context

See `proposal.md` for why. Today the Pi profile has no Vanessa, KD, or Humanizer RU skills. Cursor already has working trees:

- `vanessa-mcp` — protocol + `docs/tools.md` + `docs/write-loop.md` + install notes
- `kd2-rules` / `kd31-rules` — object model, helpers, bash `scripts/*`
- `1c-mcp-toolkit` — ROCTUP EPF HTTP API, health probe, query/exec helpers
- `humanizer-ru` — Russian editor (`SKILL.md`, `references/`, author `knowledge/`), MIT, repo `comol/Humanizer_RU` (not `ai_rules_1c`)

`1c-project-scaffold` vendors those trees into **project** `.opencode/skills/` (Humanizer: local vs global). That contradicts this profile’s contract: agent global, project data only. `/init` extras today are scaffold / Knowledge / OpenSpec — not Vanessa/KD/Humanizer.

Productize change already locked: empty default `mcp.json`, opt-in MCP, unprefixed commands, `ai_rules_1c` sync via `/review-airules`. Extras must plug into that without becoming a second `ai_rules_1c` pin.

Target container: this **profile git tree**, not a 1C CFE.

## Goals / Non-Goals

**Goals:**

- Snapshot the five skill trees into `$PI_CODING_AGENT_DIR/skills/` with extra/beta banners and a lab extras register.
- Wire `/init`, `/installtools`, `/checkmcp`, `/doctor`, overlay `AGENTS.md`, `1c-tester` / `1c-doc-writer`, and `mcp-1c-tools` so the agent actually loads them.
- Ask Vanessa / KD / Humanizer at `/init`; silence = No; enable later without full re-init.
- Keep default MCP empty; Vanessa URL is opt-in; toolkit stays HTTP; Humanizer has no MCP.
- Make a refresh path that copies from the author’s working tree without `ai_rules_1c`.

**Non-Goals:**

- Shipping Vanessa EPF / VAExtension / `client_mcp.cfe` / `MCP_Toolkit.epf` inside this git profile.
- Copying whole `1c-project-scaffold` (IB templates, OpenCode `opencode.json`, offline tarball).
- Copying the English `humanizer` skill.
- Installing the Humanizer Python linter (`uvx`) as a required init step.
- Replacing `UI_TESTING` browser tests with Vanessa.
- Making these extras part of `/review-airules` (`ai_rules_1c`).
- Adding everyday slash commands (palette stays at the current twelve).
- Rewriting Desko77 / Vanessa / Humanizer catalogs from scratch; adapt paths and Pi/Cursor dual-host only.

## Decisions

### 1. Canonical copy is the profile; Cursor skills stay the workshop

- **Choice:** Pi ships `skills/{vanessa-mcp,kd2-rules,kd31-rules,1c-mcp-toolkit,humanizer-ru}`. During beta the author may keep editing `~/.cursor/skills`. Refresh = copy workshop → profile + append `LAB-EXTRAS.md`.
- **Why:** Pi loads `$PI_CODING_AGENT_DIR/skills/`. Cursor user-skills are not what a clone of this repo gets.
- **Rejected:** Symlink-only to `~/.cursor/skills` (not portable). Project-local copies (violates global-agent contract). Treat Cursor as the shipped source of truth (clone on another PC would miss them).

### 2. Separate register, not UPSTREAM-REGISTER

- **Choice:** New `LAB-EXTRAS.md` (append-only) plus `lab-extras.lock.json` with extra/beta status, source identifier, and snapshot date per tree. For `humanizer-ru` record the Cursor snapshot and, if known, the `Humanizer_RU` commit/linter SHA already in the skill (not an `ai_rules_1c` SHA). `UPSTREAM-REGISTER.md` stays exclusive to `/review-airules`.
- **Why:** Vanessa/KD are author beta; Humanizer RU is another Comol product. Neither belongs on the `ai_rules_1c` pin.
- **Rejected:** Folding extras into `UPSTREAM-REGISTER.md`. Syncing Humanizer via `/review-airules`.

### 3. `/init` extras; later enable; `/installtools` only for Vanessa MCP URL

- **Choice:** `/init` asks Vanessa (yes/no), KD (none / 2 / 3 / both), Humanizer RU (yes/no). Silence is No. Apply writes dirs + `.dev.env` keys for Vanessa/KD; for Humanizer only a project preference (auto-use vs on-request). Vanessa MCP fragment is merged only after a URL/consent. Toolkit is never an `mcp.json` server. Humanizer is never an MCP server. Settings catalog may add `/install-vanessa-mcp` as a thin standalone; it is **not** everyday. A declined extra can be turned on later (settings / extras re-ask / first-use consent) without repeating the whole wizard.
- **Why:** Matches “do not bloat the project” and “install later”. Humanizer does not need folders or binaries to work.
- **Rejected:** Always-on Vanessa in default `mcp.json`. Copying skills into the project like OpenCode scaffold. Requiring `uv`/linter at init.

`.dev.env` keys (append if missing, never invent `ai_rules_1c` upstream names as if they were that repo’s):

| Key | Extra | Default if user left blank after Yes |
|---|---|---|
| `VANESSA_MCP_URL` | Vanessa | empty until user gives host:port from «Управление MCP» |
| `MCP_TOOLKIT_PORT` | KD | `6003` |
| `KD2_PORT` | KD 2 | `7003` |
| `KD31_PORT` | KD 3 | `6011` |

Humanizer preference lives in `.pi/1c/project.yaml` (or equivalent non-secret project flag), not as a port. Do **not** add extra keys to the `ai_rules_1c` `.dev.env.example`.

### 4. Rewrite install docs to profile paths; keep protocol text

- **Choice:** Copy skill + docs + scripts + Humanizer `knowledge/` / `references/`. Replace OpenCode/Cursor-project install assumptions with profile paths + project `.dev.env`. Keep Vanessa loop, KD object-model, and Humanizer catalog text.
- **Why:** Protocol is the value; install paths are the bug on a second machine. Owner voice/corrections are why we snapshot Cursor, not a bare GitHub clone.
- **Rejected:** Thin wrappers that `Read` Cursor home skills. Dropping `knowledge/` (would lose owner rules). Full rewrite of catalogs.

### 5. Cross-platform helpers: keep bash, add PowerShell twins where the agent would otherwise fail

- **Choice:** Keep existing toolkit/KD `scripts/*.sh`. Add `.ps1` twins for query/exec/health that read the same env keys, or document a one-liner via `powershell-windows` if a twin would duplicate too much. Agent picks by OS. Humanizer has no HTTP scripts; optional linter stays optional.
- **Why:** Profile claims Windows/Linux/macOS. Current KD helpers are bash+curl+jq.
- **Rejected:** Bash-only. Delete bash. Require Humanizer linter.

### 6. Routing tables, not a new subagent

- **Choice:** Extend `1c-tester` (Vanessa vs browser), `1c-developer` / planner pointers for KD, `1c-doc-writer` (and overlay) for Humanizer RU. No new `1c-vanessa` or `1c-humanizer` agent in this change.
- **Why:** Skills already encode the loops.
- **Rejected:** Fold Vanessa into `UI_TESTING=auto`. New everyday `/vanessa` or `/humanizer` command. Use English `humanizer` for Russian.

### 7. First snapshot source

- **Choice:** Copy from the author’s Cursor skills (and matching `1c-project-scaffold/vendor/*` if a file is missing in Cursor). `humanizer-ru` comes from Cursor (includes `knowledge/`), not from a fresh `Humanizer_RU` clone that would drop owner overlay. Record source in the lockfile as `cursor-skills` / vendor path.
- **Why:** Those trees are the live extras. Scaffold vendor is a backup for Vanessa/KD/toolkit only.

## Risks / Trade-offs

- [Beta churn] → Mitigation: lockfile + append-only `LAB-EXTRAS.md`; refresh is explicit; overlay says extras may change.
- [Two copies drift (Cursor vs profile)] → Mitigation: documented workshop → profile refresh; v1 register date is enough.
- [Vanessa MCP down looks like a product outage] → Mitigation: default `mcp.json` empty; `/checkmcp` `not configured`; skill forbids fake Success.
- [Toolkit write in production KD] → Mitigation: skill + spec require a named test copy; protection flags called out.
- [Desko77 MIT vs author beta] → Mitigation: NOTICE + skill header: ancestry MIT, Vanessa/KD extra is lab-owned beta, not `ai_rules_1c`.
- [Humanizer is Comol but not airules] → Mitigation: NOTICE names `Humanizer_RU` separately; `/review-airules` still does not touch it.
- [Init extras vs `.dev.env.example`] → Mitigation: extra keys live in a profile snippet; doctor does not flag them as `ai_rules_1c` drift.
- [Windows scripts] → Mitigation: `.ps1` or documented PowerShell HTTP; `powershell-windows` skill on Windows.
- [Humanizer auto-run on every reply] → Mitigation: init default No; skill triggers on explicit Russian-edit asks; auto-use is a project flag only.

## Migration Plan

1. Copy five skill trees into profile `skills/`; strip machine-local required paths; add extra/beta banners.
2. Add `LAB-EXTRAS.md`, `lab-extras.lock.json`, `mcp.optional/vanessa.json`, overlay/README/NOTICE/doctor/init/installtools/checkmcp/CATALOG (settings only) / tester / doc-writer / mcp-1c-tools routing.
3. Existing 1C projects: unchanged until they answer extras later or set `.dev.env` / preference themselves.
4. Rollback: delete the five skill dirs, extras register/lock, Vanessa fragment, and the prompt sentences that mention them. `ai_rules_1c` pin untouched.

## Open Questions

None that block this design. Workshop path for refresh can stay “author Cursor skills, else scaffold vendor for Vanessa/KD/toolkit” until a dedicated extras git remote exists.
