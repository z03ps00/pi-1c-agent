## 1. Harness scaffold and single runner

- [x] 1.1 Add root `package.json` (`private: true`, `"type": "module"`, `"scripts": { "test": "node tests/run-all.mjs" }`, `engines.node >= 18`)
- [x] 1.2 Add `tests/run-all.mjs` that runs every deterministic `*.test.mjs` via `node --test` and exits with its status (mirror sibling `run-all.mjs`)
- [x] 1.3 Create `tests/lib/`, `tests/unit/`, `tests/contract/`, `tests/scenario/`, `tests/fixtures/` and resolve the profile root from `import.meta.url` (never hardcode the absolute path)
- [x] 1.4 Add `.gitignore` entry for any temp/artifact output the runner may leave
- [x] 1.5 Add `tests/README.md`: the single-runner command, offline/credential-free guarantee, opt-in `RUN_LIVE_SCENARIOS=1`, failure policy (red = real regression), and the coverage table

## 2. Pure inspection helpers (`tests/lib/`)

- [x] 2.1 `mcp-inspect.mjs`: `inspectMcpJson(obj)` → unsolicited memory/knowledge/1C-bundle (8002–8008) servers; `optionalFragmentsOnly()`
- [x] 2.2 `paths-scan.mjs`: `findMachineLocalPathHits(text)` and `scanMachineLocalPaths(files)` (foreign home / volume / drive roots), ignoring the profile's own resolved root and `.example` placeholders
- [x] 2.3 `commands.mjs`: `parseCommandTitle(md)`, `findPromptFiles(dir)`, `isAliasStub(md)`, `classifyCatalogSection(commandsMd, name)`
- [x] 2.4 `agents.mjs`: `hasJsonHandoffBlock(agentMd)` (JSON `## Upstream Handoff`, required keys) and detection that markdown-only handoff is not required
- [x] 2.5 `skills.mjs`: `readSkillFrontmatter(md)`; `readCavemanDefault(files)` → `auto`
- [x] 2.6 `fsutil.mjs`: `withTempProfileCopy(fn)` / `withTempWorkspace(fn)` using `fs.mkdtemp`, plus `diffTree(before, after)` for created/modified/deleted sets

## 3. Unit tests (`tests/unit/`)

- [x] 3.1 Test each helper in section 2 on a compliant fixture and a violating fixture (assert both outcomes)
- [x] 3.2 Add `tests/fixtures/` good/bad samples (mcp.json variants, prompt titles, alias stub, agent handoff block, skill front-matter, caveman default)
- [x] 3.3 Assert `scanMachineLocalPaths` ignores the profile's own root and `$PI_CODING_AGENT_DIR` / `.example` placeholders

## 4. Regression / contract tests (`tests/contract/`, read-only against real files)

- [x] 4.1 `mcp.json` default: no memory/knowledge/1C 8002–8008; Vanessa only in `mcp.optional/`
- [x] 4.2 Command surface: no `help`/`plan`/`build`/`debug` prompt; prompt titles unprefixed (`/installmcp` not `/1c-installmcp`); `/1c-*` alias stubs present; `/commands` exists
- [x] 4.3 `/review-airules` prompt exists and is classified maintainer in `CATALOG.md`/`commands.md`
- [x] 4.4 Destructive infobase prompts (`update1cbase`, `restore-testbase`, `deploy-and-test`, `build-release`) require target confirmation text
- [x] 4.5 Writer/pipeline agents require JSON `## Upstream Handoff`; markdown-only handoff not required
- [x] 4.6 `CAVEMAN` shipped default is `auto` across the files that bake it in
- [x] 4.7 `NOTICE` exists and separates upstream vs overlay; `settings.json` uses `<path-to-pi-1c-agent>` placeholder
- [x] 4.8 `upstream.lock.json` carries the seeded pin `410951e74fd3e6b7a763cf49757935b9a34d3f31`
- [x] 4.9 No shipped file contains a foreign machine-local path (`scanMachineLocalPaths` over the tracked tree)
- [x] 4.10 Lab extras present as skills (`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `1c-mcp-toolkit`, `humanizer-ru`) and isolated from `ai_rules_1c` (not in `UPSTREAM-REGISTER.md`)
- [x] 4.11 `AGENTS.md` overlay has no global "never docker" ban and keeps the `PI-1C-AGENT` markers

## 5. Scenario tests (`tests/scenario/`)

- [x] 5.1 Static scenario: PLAN decision text permits only planning artifacts (`openspec/**`, `.pi/1c/plans/**`, `.pi/1c/knowledge-drafts/**`) and protects project code
- [x] 5.2 Static scenario: `/checkmcp` default is status-only (no container start); repair path is explicit
- [x] 5.3 Static scenario: fresh-clone flow leaves optional MCP unconfigured and emits no startup connect failure requirement
- [x] 5.4 Live-scenario harness (`RUN_LIVE_SCENARIOS=1`, `pi-cursor-sdk`): run agent in a temp profile copy + temp project; assert file effects (created/modified) and an untouched-files set; self-skip without flag/credentials/SDK
- [x] 5.5 Assert scenario tests never assert exact reply wording (review checklist noted in `tests/README.md`)

## 6. Isolation guarantees

- [x] 6.1 Add a guard test: after the full run, `git status --porcelain` for pre-existing tracked files is unchanged
- [x] 6.2 Confirm every write-effect test goes through `withTempProfileCopy` / `withTempWorkspace`; none reference a real `.dev.env` or downstream project

## 7. Coverage table and full run

- [x] 7.1 Fill the coverage table in `tests/README.md` (functionality / covering test / type / status) from sections 3–5
- [x] 7.2 Run `node tests/run-all.mjs`; fix failures in the tests or, if a real regression is found, in the profile; re-run until green
- [x] 7.3 Record the final pass count and any skipped live scenarios (with reason) in `tests/README.md`

## Coverage table (planned)

| Functionality / доработка | Covering test | Type | Status |
|---|---|---|---|
| Default `mcp.json` has no unsolicited memory/knowledge/1C-bundle | `unit/mcp-inspect` + `contract/mcp-default` | unit + regression | planned |
| Vanessa MCP only in `mcp.optional/` | `contract/mcp-default` | regression | planned |
| No `/help` `/plan` `/build` `/debug` prompts | `contract/command-surface` | regression | planned |
| Prompt titles unprefixed; `/1c-*` alias stubs exist | `unit/commands` + `contract/command-surface` | unit + regression | planned |
| `/commands` + `/review-airules` exist; maintainer classification | `unit/commands` + `contract/catalog` | unit + regression | planned |
| Destructive IB prompts confirm target | `contract/destructive-confirm` | regression | planned |
| Writer/pipeline agents require JSON `## Upstream Handoff` | `unit/agents` + `contract/handoff` | unit + regression | planned |
| `CAVEMAN` default `auto` | `unit/skills` + `contract/caveman` | unit + regression | planned |
| `NOTICE` present; `settings.json` placeholder | `contract/notice-settings` | regression | planned |
| `upstream.lock.json` seeded pin | `contract/upstream-pin` | regression | planned |
| No foreign machine-local paths in shipped tree | `unit/paths-scan` + `contract/machine-paths` | unit + regression | planned |
| Lab extras present + isolated from `ai_rules_1c` | `contract/lab-extras` | regression | planned |
| Overlay has no global docker ban; `PI-1C-AGENT` markers | `contract/overlay` | regression | planned |
| PLAN permits only planning artifacts, protects project code | `scenario/plan-only` | scenario (static) | planned |
| `/checkmcp` default is status-only | `scenario/checkmcp-status` | scenario (static) | planned |
| Fresh clone: optional MCP unconfigured | `scenario/fresh-clone` | scenario (static) | planned |
| End-to-end file effects (created/modified/untouched) | `scenario/live-*` | scenario (live, opt-in) | planned |
| No test mutates real profile/projects | `contract/git-clean-guard` | regression | planned |
