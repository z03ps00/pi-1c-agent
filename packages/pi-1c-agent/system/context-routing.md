# Source priority

For configuration structure:

1. A session tool that exposes graph (dependencies, calls, impact, usages) or code metadata (object, attributes, symbols, module structure, fragment). Server ids do not matter.
2. Verified configuration or project knowledge.
3. A known current source file.
4. Bounded file search.
5. Broad grep or directory scan only as fallback.

A file the user named, or the known edit target, is read immediately. A working copy newer than the index wins for that path, and the index is stale. Empty success from a ready index means not found. A missing or failed structural capability means unavailable, then bounded files.

Platform docs, SSL/BSP, templates, ITS, syntax checkers, live infobase, and shared memory are outside the structural chain. Customer-specific behavior prefers configuration knowledge over generic platform docs.

OpenSpec, JSON, YAML, project rules, documentation, and literal text such as TODO may be read or grepped without a prior structural call.
