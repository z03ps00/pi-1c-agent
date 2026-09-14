## Purpose

Defines how the Pi 1C profile ships, installs, brings up, configures, health-checks, and disables the paired OpenViking (`knowledge`) + Cognee (`memory`) memory MCP stack portably from one agent command, with Router AI as the default provider and Ollama as a pre-configured alternative, so any machine reproduces the same servers, models and settings.

## ADDED Requirements

### Requirement: One command brings up both memory servers portably

The profile SHALL provide a single agent command that provisions and starts **both** OpenViking (`knowledge`) and Cognee (`memory`) together, using assets that ship inside the profile and do not depend on the lab tree `/mnt/vol_328/MCP`, the external Docker network `tunnel_tunnel-net`, or the lab IPs `172.19.0.1` / `172.19.0.100`. The command SHALL be runnable on a machine that has never seen the lab and SHALL still bring the pair to a healthy state.

The stack SHALL pin the OpenViking and Cognee container images (by digest or explicit tag) so different machines run the same versions.

#### Scenario: Fresh machine bring-up

- **WHEN** a user runs the memory install command on a machine with Docker available and no `/mnt/vol_328/MCP` tree
- **THEN** the agent starts both `knowledge` (OpenViking) and `memory` (Cognee) from profile-shipped Compose assets and reports both healthy

#### Scenario: No dependency on lab network or IPs

- **WHEN** the shipped stack is inspected
- **THEN** it does not require the external `tunnel_tunnel-net` network, the AWG proxy, or the hardcoded `172.19.0.*` addresses to reach a healthy state

### Requirement: Only API keys are collected; all other settings default automatically

The install command SHALL set the provider, models, embedding model, dimensions, dataset, database backends, ports and every other non-secret setting from shipped defaults without asking the user. The only inputs the command MAY require from the user are secrets (provider API key and, for OpenViking, the root/client keys). Missing non-secret settings SHALL NOT block the bring-up.

#### Scenario: Defaults applied without prompting

- **WHEN** the user runs the install command and supplies only the provider API key
- **THEN** models, embeddings, ports, dataset and backends are taken from shipped defaults and the user is not asked to choose them

#### Scenario: Secrets are the only required input

- **WHEN** the required provider API key (or OpenViking key) is missing
- **THEN** the command stops with a clear message identifying the missing secret and does not invent or commit a placeholder key

### Requirement: Router AI is the default provider with reproducible settings

By default the stack SHALL configure Router AI (`https://routerai.ru/api/v1`) as the provider for both servers, reproducing the current working configuration: Cognee LLM `hosted_vllm/${ROUTERAI_MODEL}` with `reasoning_effort=none`, Cognee + OpenViking embeddings `qwen/qwen3-embedding-8b` at dimension `1024`, Cognee databases `sqlite` / `lancedb` / `ladybug`, authentication disabled, and the shared Cognee dataset `main_dataset` (agent scoping off). Selecting the default provider SHALL NOT require any choice beyond the Router AI API key.

#### Scenario: Default install uses Router AI

- **WHEN** the user runs the install command without naming a provider
- **THEN** both servers are configured for Router AI with the embedding model `qwen/qwen3-embedding-8b` at dimension 1024 and Cognee uses `reasoning_effort=none`

#### Scenario: Reproducible non-secret configuration

- **WHEN** the same default install runs on two different machines with valid Router AI keys
- **THEN** both produce the same models, endpoints, dimensions, dataset and database backends, differing only in the secret key values

### Requirement: Ollama is available as a pre-configured alternative

The stack SHALL offer an Ollama-backed provider option with pre-set models for both servers (LLM/VLM plus an embedding model) so a user can choose fully local inference without hand-editing configs. Choosing Ollama SHALL configure Cognee and OpenViking consistently against the same local Ollama endpoint and pre-declared models, and SHALL be reachable through the same single install command via an explicit selection.

#### Scenario: Selecting the Ollama alternative

- **WHEN** the user runs the install command and explicitly selects the Ollama provider
- **THEN** both servers are configured against the local Ollama endpoint with the pre-set LLM/VLM and embedding models, and no external provider key is required

#### Scenario: Ollama parity across both servers

- **WHEN** the Ollama provider is selected
- **THEN** Cognee has an Ollama configuration (not only OpenViking) so the pair works together instead of one server falling back to a different provider

### Requirement: Our memory stack supersedes the upstream Cognee installer

The profile's guided installers (`/install-cognee`, `/install-openviking`, `/installtools`) SHALL install **our** paired OpenViking + Cognee stack. The agent SHALL NOT install the upstream `comol/ai_rules_1c` Cognee MCP; where upstream would offer its own Cognee, the agent SHALL instead offer our stack. `/install-cognee` and `/install-openviking` SHALL describe the real shipped servers (correct ports, images, dataset and provider), not a contradictory single-container install.

#### Scenario: Upstream Cognee is not installed

- **WHEN** an upstream flow would install the `comol/ai_rules_1c` Cognee MCP
- **THEN** the agent installs or offers our paired OpenViking + Cognee stack instead and does not create the upstream Cognee server

#### Scenario: Install prompts match reality

- **WHEN** a user reads `/install-cognee`
- **THEN** it describes the shipped Cognee (paired with OpenViking, its actual port and image, dataset `main_dataset`, Router AI default) rather than an unrelated `cognee/cognee-mcp:main` single-container setup

### Requirement: Client fragments and tool exposure match the shipped stack

The opt-in client fragments (`mcp.optional/memory.json`, `mcp.optional/knowledge.json`), `mcp.example.json`, and their documentation SHALL reference the URLs and tool names the shipped servers actually expose, so a client that merges a fragment connects to the running stack without contradiction. Memory stays opt-in: default `mcp.json` SHALL remain empty of `memory` / `knowledge` until the user installs the stack.

#### Scenario: Fragment connects to the running stack

- **WHEN** a user merges `mcp.optional/memory.json` (or `knowledge.json`) after installing the stack
- **THEN** the client connects to the running server and the exposed tool names in the fragment match the tools the server actually provides

#### Scenario: Default profile still ships no memory servers

- **WHEN** a fresh profile is deployed without running the install command
- **THEN** default `mcp.json` registers neither `memory` nor `knowledge` and emits no startup connect failures for them

### Requirement: Status, health and disable are supported

The stack SHALL provide a way to check both servers' health/status and a way to disable or stop them without deleting stored memory data and without affecting other MCP servers. Disabling one provider SHALL leave the other and the 1C bundle untouched.

#### Scenario: Health check reports both servers

- **WHEN** the user checks memory status after install
- **THEN** the agent reports health/reachability for both `knowledge` and `memory` distinctly

#### Scenario: Disable without data loss

- **WHEN** the user disables the memory stack
- **THEN** the servers stop or their `mcp.json` entries are removed, stored memory data is preserved on disk, and other MCP servers remain configured

### Requirement: Secrets never enter git or shared memory

All provider API keys and OpenViking root/client keys SHALL live only in local secret files (for example `secrets/*.env` or `.dev.env`) that are git-ignored, and SHALL NOT be written into committed files, shared memory (`remember`), knowledge documents, `AGENTS.md`, handoffs, or command output. Shipped secret files SHALL be `.example` templates with empty values.

#### Scenario: Only example secrets are committed

- **WHEN** the repository is inspected after this change
- **THEN** it contains only secret `.example` templates with empty values and no real API keys

#### Scenario: Keys stay out of memory writes

- **WHEN** the agent records anything to Cognee/OpenViking or a handoff during install
- **THEN** no API key, root key, or client key appears in that content

### Requirement: Memory skills and rules match the real tools and configuration

The memory/knowledge skills (`shared-memory`, `knowledge-retrieval`, `context-bootstrap`, `context-router`, `memory-safety`, `memory-maintenance`, `session-handoff`) and the global memory rule SHALL reference the tool names, servers, ports, dataset and provider that the shipped stack actually uses, so guidance and reality do not contradict each other. Where the current rule text names mutating tools or servers that differ from what the stack exposes, the audit SHALL reconcile them.

#### Scenario: Skill guidance is consistent with exposed tools

- **WHEN** a memory/knowledge skill instructs the agent which write tool to call
- **THEN** the named tool exists on the shipped server and is not contradicted by another skill or by the client fragment

#### Scenario: Audit corrects contradictions

- **WHEN** the audit finds a skill or rule that names a wrong port, server, dataset, or tool for the shipped stack
- **THEN** that skill or rule is corrected so it matches the shipped configuration
