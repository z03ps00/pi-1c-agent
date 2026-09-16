---
description: [settings] Plant `.pi/1c` project knowledge dirs into an existing 1C repo — do not copy the agent
---

# /init-knowledge — plant project knowledge layout

Cursor procedure for Pi `/init knowledge`. In Pi BUILD on a trusted project, prefer the TUI command `/init knowledge`. This prompt is for Cursor (no `/init` TUI) and for an existing 1C repo that has no `.pi` yet.

Plant **only** the project knowledge tree. Do **not** copy the agent (`rules-1c/`, `agents/`, profile `skills/` or `prompts/`). Do **not** run `bootstrap.mjs --project`. Do **not** write `.dev.env`. Do **not** create OpenSpec `.pi/prompts` or `.pi/skills`.

## Target layout

```text
.pi/1c/
├── knowledge/
│   ├── items/
│   └── fingerprint.json      # only when fingerprinting
├── knowledge-drafts/
├── rules/
│   ├── configuration/
│   └── project/
├── configuration.json        # only if name+version known and file missing
├── project.yaml              # only if missing
└── init-state.json           # only if missing
```

Existing `knowledge/items`, `knowledge-drafts`, and `rules/**` JSON files must not be deleted or overwritten.

## Steps

1. Work in the **1C project** directory, not in `$PI_CODING_AGENT_DIR`.
2. Autodetect `Configuration.xml` for name, version, and source root (usually `src/cf`). Ask only if autodetection is empty.
3. Prefer the package helper. Quote `$PI_CODING_AGENT_DIR` (the profile path may contain spaces):

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const profile = process.env.PI_CODING_AGENT_DIR?.trim();
if (!profile) throw new Error('PI_CODING_AGENT_DIR is unset');
const spec = pathToFileURL(path.join(profile, 'packages', 'pi-1c-agent', 'lib', 'project-init.mjs')).href;
const { detectConfiguration, ensureProjectKnowledgeLayout } = await import(spec);
const cwd = process.cwd();
const detected = detectConfiguration(cwd);
const result = ensureProjectKnowledgeLayout(cwd, {
  projectName: path.basename(cwd),
  configurationName: detected.name,
  configurationVersion: detected.version,
  sourceRoot: detected.sourceRoot || 'src/cf',
  fingerprint: Boolean(detected.name && detected.version && !fs.existsSync(path.join(cwd, '.pi', '1c', 'configuration.json'))),
  writeManifests: true,
});
console.log(JSON.stringify({
  created: result.created,
  existing: result.existing,
  fingerprintInitialized: result.fingerprintInitialized,
  manifestsCreated: result.manifestsCreated,
}, null, 2));
EOF
```

4. If the helper cannot be imported, create only the missing directories listed above. Do not invent OpenSpec or agent files.
5. Report what was created vs already present. State that the agent was not copied. Suggest `/learn` for facts and full `/init` when `.dev.env` is still needed.
