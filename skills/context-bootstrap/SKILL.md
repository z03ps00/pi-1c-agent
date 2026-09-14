---
name: context-bootstrap
description: "Initialize minimal project context at the beginning of meaningful work: identify project, authoritative files, available Cognee/OpenViking MCPs, and appropriate memory/knowledge scope."
---

# Context Bootstrap

Run at the beginning of a meaningful project work session, not for trivial chat.

## Steps

1. Identify the current project/repository/workspace from available evidence.
2. Inspect project instructions such as AGENTS.md and local rules.
   When the workspace is `C:/DevopsMoments/pi-agents` or the active profile is the DevOps
   profile, also read `C:/DevopsMoments/pi-agents/config/agent-path-registry.json` as a
   navigation map of operational paths. It does not override current files,
   `INDEX.md`, local indexes or live read-only checks.
3. Determine current branch/worktree/state when relevant and available.
4. Discover whether Cognee and OpenViking MCP tools are actually connected.
5. Establish logical scopes:
   - memory: `project:<project-id>` plus optional `global`;
   - knowledge: project/repository namespace when the provider supports it.
6. Retrieve only minimal start context that materially affects the task.

Do not load the entire memory or knowledge base.

If project identity is ambiguous and scope matters for a write, ask or derive it from the actual repository path/config before storing project memory.
