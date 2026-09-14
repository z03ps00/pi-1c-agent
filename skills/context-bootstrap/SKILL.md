---
name: context-bootstrap
description: "Initialize minimal project context at the beginning of meaningful work: identify project, authoritative files, available Cognee/OpenViking MCPs, and appropriate memory/knowledge scope."
---

# Context Bootstrap

Run at the beginning of a meaningful project work session, not for trivial chat.

## Steps

1. Identify the current project/repository/workspace from available evidence.
2. Inspect project instructions such as AGENTS.md and local rules.
   If an `agent-path-registry.json` exists in the active profile, you may read it
   as a navigation map. It does not override current files, `INDEX.md`, local
   indexes or live read-only checks.
3. Determine current branch/worktree/state when relevant and available.
4. Discover whether Cognee (`memory`, `127.0.0.1:8001`, dataset `main_dataset`) and OpenViking (`knowledge`, `127.0.0.1:1933`) MCP tools are actually present in `mcp.json` **and** connected. If they are not configured, note “memory MCP not in use” **once** and do **not** call `recall`. Do not retry. Install path is `/install-memory-mcp`, not the upstream Cognee installer.
5. Establish logical scopes only when those servers are in use:
   - memory: `project:<project-id>` plus optional `global`;
   - knowledge: project/repository namespace when the provider supports it.
6. Retrieve only minimal start context that materially affects the task.

Do not load the entire memory or knowledge base.

If project identity is ambiguous and scope matters for a write, ask or derive it from the actual repository path/config before storing project memory.
