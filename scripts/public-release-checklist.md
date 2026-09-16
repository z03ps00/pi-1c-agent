# Public release pre-flight checklist

Gate for the first public push of this Pi 1C profile. Do not push until every
item is decided and the scan (`node scripts/scan-public-tree.mjs`) plus
`npm test` are green.

**Private clone (this working copy):** keep developing here. Current remote
`origin` is the existing private history. Do not force-push that history to a
public URL.

**Public repo:** created by `node scripts/export-public-repo.mjs <dest>` as a
fresh git repository with one clean commit. Add the public remote only on that
export. Never add the private remote there.

## How to publish

1. In this private clone, finish sanitization and run `npm test`.
2. Run `node scripts/scan-public-tree.mjs` (exit 0).
3. Re-read this checklist; every row below must be **ship**, **exclude**, or **sanitize**.
4. Export: `node scripts/export-public-repo.mjs /path/to/pi-1c-agent-public`
5. In the export: `git ls-files` and `git log -p` — no `openspec/changes/`,
   `handoffs/`, `opsx-*`, real names, or secret-shaped values.
6. `cd` into the export, add the **new empty** public remote, push `main`.
7. Leave this private clone’s `origin` unchanged.

## Secret scan (task 1.3)

Re-run on 2026-09-16 over tracked files and full history.

| Hit class | Result |
|---|---|
| Real key files (`auth.json`, `trust.json`, `.dev.env`, `secrets/*.env`, `*.pem`) | Never committed; already `.gitignore`d |
| Env / placeholder references (`${ROUTERAI_API_KEY}`, `${KNOWLEDGE_MCP_AUTHORIZATION}`, `__OPENVIKING_*__`, `<PUT-YOUR-…>`) | OK — ship |
| Synthetic redact fixtures (`sk-abcdefghijklmnopqrstuvwxyz012345`, `password=hunter2`, PEM stub in tests) | OK — ship as fixtures |
| `dummy-for-config`, `no-key`, empty `*.env.example` | OK — ship |
| History `-S` for `sk-` / `ghp_` / `AKIA` | Only the synthetic fixture and the redaction regex |

**Verdict:** no real secrets in the tree or in the 13-commit private history.

## Identity / machine-path classification (task 1.4)

| Hit | Where | Decision |
|---|---|---|
| Linux home + real username | OpenSpec changes; path-scanner fixtures and tests | **remove-with-artifact** for OpenSpec changes; **sanitize-in-fixture** to `/home/someone` (scanner still matches; `/home/<user>` is a doc placeholder and would not trip the scanner) |
| Lab volume mounts (`/mnt/vol_*` with real numbers) | OpenSpec changes; `memory-integrity`, `product-health`, `update-pi-cli`, `bad.md` | **remove-with-artifact** for OpenSpec; **sanitize-in-fixture** to a generic volume sample or `/opt/…` in shipped tests |
| Developer first name in sibling-env fixture | `packages/pi-1c-agent/tests/project-init.test.mjs` | **sanitize-in-fixture** → `Dev` |
| Private remote owner | git remotes only (not in tracked file contents) | **keep private remote on this clone**; do not copy remotes into the export |
| `IB_PASSWORD=secret-a/-b` | project-init sibling-scan test | **keep** — synthetic values, never a real password |

## Top-level path decisions

| Path | Decision | Recommendation |
|---|---|---|
| `AGENTS.md` | **ship** | Product overlay. No change. |
| `README.md` | **sanitize** | Rewrite for the 1C community (what / who / install / license). |
| `LICENSE` | **ship** | Add MIT for this author’s original work. |
| `NOTICE` | **sanitize** | Keep upstream facts; add thanks + licensing boundary. |
| `LAB-EXTRAS.md`, `lab-extras.lock.json` | **ship** | Lab extras register, not airules. |
| `UPSTREAM-REGISTER.md`, `upstream.lock.json` | **ship** | Comol pin. |
| `.gitignore` | **sanitize** | Add denylist for dev artifacts and opsx tooling. |
| `package.json` | **ship** | Profile test runner. |
| `settings.json` | **ship** | Placeholder `<path-to-pi-1c-agent>`; no machine path. |
| `mcp.json`, `mcp.example.json`, `mcp.optional/` | **ship** | Empty default + opt-in fragments. Secrets stay `.gitignore`d. |
| `MCP-OAUTH.md` | **ship** | Public OAuth recipe. |
| `auth.example.json`, `trust.example.json`, `dev.env.lab-extras.example` | **ship** | Placeholders only. |
| `auth.json`, `trust.json`, `.dev.env`, `.env` | **exclude** | Already ignored. Never copy into the export. |
| `cursor-sdk.json`, `cursor-sdk-context-windows.json`, `models-store.json` | **ship** | No credentials. |
| `manifest/` | **ship** | OAuth client URI helper. |
| `agents/`, `skills/`, `prompts/`, `rules-1c/` | **ship** | Product. Keep third-party adapted material and credit it. |
| `packages/pi-1c-agent/` | **ship** | Runtime. Sanitize identity in its tests. |
| `scripts/setup.mjs`, `update-profile.mjs`, `update-pi-cli.mjs` | **ship** | Host helpers. |
| `scripts/scan-public-tree.mjs`, `export-public-repo.mjs`, `public-release-checklist.md` | **ship** | Publication gate. |
| `tests/` | **ship** | Genericize fixtures; keep scanner bad-path samples synthetic. |
| `state/agent-memory/README.md`, `task-completion-template.md`, `done/.gitkeep` | **ship** | Empty-queue placeholders. |
| `state/agent-memory/pending/**`, `state/agent-memory/done/*.md` | **exclude** | Local memory queue. `.gitignore`. |
| `handoffs/` | **exclude** | Session handoffs. `.gitignore`. |
| `openspec/README.md`, `config.yaml`, `project.md`, `openspec/specs/` | **ship** | Product spec home. `changes/` is local-only. |
| `openspec/changes/**` | **exclude** | Development proposals (including this change). `.gitignore`. |
| `.cursor/commands/opsx-*`, `.cursor/skills/openspec-*` | **exclude** | Cursor OpenSpec workflow. `.gitignore`. |
| `.cursor/plans/` | **exclude** | Planner scratch. `.gitignore`. |
| `.pi/prompts/opsx-*`, `.pi/skills/openspec-*` | **exclude** | Pi OpenSpec workflow. Keep `.pi/**` ignored. |
| `pi-1c-agent-upstream/`, `node/`, `npm/`, `bin/`, `1c/` | **exclude** | Already ignored. |
| `.git/` | **exclude from export copy of history** | Export runs `git init` anew. |

## Sign-off

- [x] `npm test` green (profile + `packages/pi-1c-agent`)
- [x] `node scripts/scan-public-tree.mjs` exit 0
- [x] Export `git ls-files` has no denylist paths (verified via `scripts/export-public-repo.mjs`; root `.cursor/commands/opsx-*` and `openspec/changes/` absent). The vendored `rules-1c/openspec-bundle-reference/**` snapshot is product reference, not this profile’s workflow.
- [x] Export `git log` is a single clean commit, no remotes, no identity hits
- [ ] Maintainer: create a **new empty** public remote, push from the export only; leave this clone’s `origin` untouched
