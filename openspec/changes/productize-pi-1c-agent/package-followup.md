# Package follow-up (`pi-1c-agent`, outside this git tree)

Design decision 8: APPLY in this profile repo does prompts, `mcp.json`, overlay, skills, README, NOTICE, `/commands`, `/review-airules`, register + pin. These package edits are required for a complete product but live in `pi-1c-agent`, not here.

Implemented 2026-09-14 in `~/.pi/packages/pi-1c-agent` (not this git tree). Package tests 62/62; `doctor --package-only` CORE PASS.

## 4.4 / 9.5 Docker `tool_call` hard-block

Done: `lib/docker-policy.mjs` + `extensions/1c-mode/index.ts`. Hard-block only when `PI_1C_BLOCK_DOCKER=1` **or** a socket auto-detect says the engine is unreachable. Product default allows `docker ps` when a socket exists.

## 9.1 Command registration

Done: `registerCommand("init")` and `registerCommand("doctor")`. `/1c-init` and `/1c-doctor` remain aliases. `package-contract.test.mjs` updated.

## 9.2 `/init` TUI

Done: first interactive question is empty source scaffold vs dump from IB / `.cf` / `.dt`. `from-ib` / `from-cf` / `from-dt` jump to the dump follow-up.

## 9.3 Bootstrap

Done: bootstrap does not create or patch `mcp.json`. Default stays empty `mcpServers` (opt-in).

## 9.4 `doctor.mjs`

Done: CORE fails on machine-local roots in shipped files and on a shipped default `mcp.json` that still has unsolicited memory/knowledge/1C bundle servers.
