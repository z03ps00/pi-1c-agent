# Client bundle vs GitHub

Three layers. Do not delete source from GitHub so the repository looks like a customer zip. Another product's Windows bundle (EXE, bundled Node, Java, `node_modules`) is not this profile.

## Working copy

Local only, already gitignored: `external-agent-sources/`, `state/agent-memory/{pending,processing,failed,done}/` except `.gitkeep`, `handoffs/`, `openspec/changes/`, `auth.json`, `trust.json`, `.dev.env`. Never commit them.

## GitHub

The clone is the install (`PI_CODING_AGENT_DIR`). Keep `tests/`, `.github/`, `UPSTREAM-REGISTER.md`, publication scripts, and the full `rules-1c/` and `skills/`. Memory skills and lab extras (`vanessa-mcp`, `kd2-rules`, `kd31-rules`, `humanizer-ru`, `1c-mcp-toolkit`) are part of the profile. Do not strip them to imitate another product's `agent/` folder. Do not vendor Node, Java, Python, or `node_modules`.

`node scripts/scan-public-tree.mjs` stays the gate for secrets, identity, and machine paths in the git tree.

## Client archive

Generated, not committed. `node scripts/package-client-bundle.mjs` writes `dist/pi-1c-agent-<version>-client.zip` and `dist/SHA256SUMS-<version>.txt`. `dist/` is gitignored. The version comes from `packages/pi-1c-agent/package.json`.

The archive is a profile for an already installed Pi and Node.js. Unpack it and run the same `scripts/setup.mjs` as after a clone.

### Inside

Root files the installer needs: `AGENTS.md`, `README.md`, `INSTALL-AGENT.md`, `LICENSE`, `NOTICE`, `LAB-EXTRAS.md`, `lab-extras.lock.json`, `UPSTREAM-REGISTER.md`, `upstream.lock.json`, `MCP-OAUTH.md`, `package.json`, `settings.json`, `.gitignore`, `mcp.json` (only when `mcpServers` is empty; otherwise the archive gets `mcp.example.json` under the name `mcp.json`), `mcp.example.json`, `auth.example.json`, `trust.example.json`, `dev.env.lab-extras.example`, `cursor-sdk.json`, `cursor-sdk-context-windows.json`, `models-store.json`.

Trees: `agents/`, `prompts/`, `skills/`, `rules-1c/`, `mcp.optional/`, `manifest/`, `packages/pi-1c-agent/` without its `tests/`.

Launch and setup scripts: `scripts/pi-1c`, `scripts/pi-1c.cmd`, `scripts/pi-1c-ctl`, `scripts/pi-1c-ctl.cmd`, `scripts/pi-1c-ctl.mjs`, `scripts/pi-1c-acp`, `scripts/pi-1c-acp.cmd`, `scripts/Pi-1C-Agent.desktop.in`, `scripts/setup.mjs`, `scripts/update-profile.mjs`, `scripts/update-pi-cli.mjs`, `scripts/lib/pi-1c-ctl-lib.mjs`.

Memory placeholders: `state/agent-memory/README.md`, `state/agent-memory/task-completion-template.md`, `state/agent-memory/pending/.gitkeep`, `state/agent-memory/done/.gitkeep`, `state/evolution/.gitkeep`.

### Outside

`tests/`, `.github/`, `.vscode/`, `.cursor/`, `openspec/`, `handoffs/`, `external-agent-sources/`, `pi-1c-agent-upstream/`, `node_modules/`, `dist/`, publication scripts (`scripts/export-public-repo.mjs`, `scripts/scan-public-tree.mjs`, `scripts/public-release-checklist.md`, `scripts/package-client-bundle.mjs`), live `auth.json`, `trust.json`, `.dev.env`, `.env`. No `Pi-1C.exe`, no bundled Node, Java, or Python.

The packager refuses secret-shaped values, machine-local paths, and live credential filenames before it writes the zip.
