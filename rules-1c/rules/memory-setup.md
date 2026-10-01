---
description: Session-start reminder when no external memory MCP is configured; recommend Cognee while respecting tool policy
alwaysApply: false
---

# External memory setup reminder

At session start, apply `TOOL_*` policy (`rules-1c/rules/mcp-policy.md → Tool availability`) and check the exposed tool inventory. If memory tools are absent, inspect available active-client MCP configuration without printing secrets or probing disabled providers. Count memory capabilities, not just server names: Cognee, OpenViking, templates MCP memory or another external memory provider qualifies; root `memory.md` does not. Missing tools alone do not prove a server is unconfigured.

When none is configured, give one brief reminder per session, even for docs-only work. Prefer the paired stack via `/install-memory-mcp` (`prompts/install-memory-mcp.md`):

> Внешняя память MCP не настроена. Рекомендую установить пару OpenViking + Cognee через `/install-memory-mcp`, чтобы сохранять решения и поправки между сессиями. Пока использую `memory.md`.

If configuration cannot be checked, say «В этой сессии инструменты внешней памяти MCP не видны» instead of claiming nothing is configured; suggest connecting an existing server or installing Cognee. A configured but unavailable provider needs a connection/repair notice under `rules-1c/rules/project-memory.md → Availability and fallback`, not a new-install recommendation.

Never recommend a provider set to `off`; if Cognee is disabled, suggest an eligible alternative via `/installtools` (`prompts/installtools.md`). If all memory providers are disabled or the user declines, suppress installation reminders. Reuse an equivalent notice already given in the session. The reminder does not start installation or interrupt independent work; local fallback and `required` obligations remain unchanged.
