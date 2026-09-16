---
name: 1c-knowledge
description: Retrieve, propose, audit and maintain scoped 1C configuration/project knowledge without bloating context.
---

# 1C Knowledge Layer

Use `knowledge_1c` selectively before non-trivial planning or implementation when configuration/project-specific context may matter.

Precedence:

1. explicit active PROJECT rule/preference;
2. active CONFIGURATION rule/preference;
3. fresh verified CONFIGURATION fact;
4. other configuration facts;
5. assumptions;
6. generic BASE `ai_rules_1c` rules.

Never treat a draft as active knowledge. `/learn` with no argument opens a picker (new fact/rule | approve a draft | reject a draft), like `/mode`. `/config analyze/update` create proposals. Canonical activation requires explicit approval in BUILD.
