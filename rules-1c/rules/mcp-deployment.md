---
description: MCP deployment target, optional shared Linux Docker host, client addresses and automatic free-port allocation. Load for MCP installation, connection setup, diagnostics and updates.
alwaysApply: false
---

# MCP deployment — host, addresses and ports

> **Pi profile.** Optional shared-host layout for a 1C project's MCP. This profile's default `mcp.json` stays empty. Lab helpers `~/mcp-ctl.sh` and `~/mcp-host.sh` are optional and are not required here.

Applies to the 1C MCP bundle and memory services. Local deployment is the ordinary path; a shared network server is an optional path, not a prerequisite. Reuse existing choices before asking. This rule governs deployment plumbing; the selected distribution/provider still owns images, container ports, environment variables and data formats.

## Choose the target once

Include one compact choice in the installer's existing question, only when the target is unknown:

> Где разместить MCP: на этом компьютере (обычный вариант), на общем сервере Debian/Ubuntu с Docker или подключить уже работающие серверы? Для общего сервера укажите DNS/IP и доступ для установки; вместо 127.0.0.1 можно использовать адрес сервера. Свободные порты я проверю и подберу сам.

An already selected target needs no repeat question. Connecting an existing endpoint uses `/setupmcp` (`prompts/setupmcp.md`), with no package installation or port allocation. Separate the editor's OS from the Docker host's OS: a Windows client can use Linux services without local Docker, WSL or Docker Desktop.

Inspect the chosen Docker context/connection, daemon OS/architecture, `docker info` and `docker compose version`. Run every Docker operation against that same target explicitly (selected context or authorized SSH); do not switch the user's global context as a side effect. On Debian/Ubuntu use native Docker Engine and the Compose plugin; if missing, follow the current official [Debian](https://docs.docker.com/engine/install/debian/) or [Ubuntu](https://docs.docker.com/engine/install/ubuntu/) instructions for that host. Docker Desktop is an option for a selected local Windows/macOS host, never a universal prerequisite. Distinguish absent software, stopped daemon, denied access and unavailable remote access before proposing repair.

Use the target OS's shell and absolute paths. PowerShell examples are examples, not a Windows requirement. A bind mount's source belongs to the **Docker daemon host**, not the editor machine ([Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)). Verify exports, platform files and persistent directories there; never mount a client-only `C:\...` path on Linux. Missing source transfer/path mapping stays explicit pending work. Preserve source freshness, project/index IDs and memory scope across teammates; never repoint a shared index/store to the next developer's project.

## Distinguish bind address and client URL

For local-only access use loopback. Offer a DNS name/IP instead of `127.0.0.1` when network access is selected; use the client-reachable address in every MCP URL. Never write `0.0.0.0` as a client destination. Loopback on a remote host is reachable only through an established tunnel/proxy, whose client URL must be recorded separately.

For direct LAN/VPN access publish on the selected host interface, or use the existing authenticated reverse proxy and preserve its scheme/path. Broader interface binding must match the requested access scope; do not publish to all interfaces or the public Internet by default. Keep backend databases internal unless explicitly required. Use supported authentication/secret references for shared access. Verify the actual Docker/network access restrictions; merely enabling `ufw` does not restrict all Docker-published traffic ([port publication](https://docs.docker.com/engine/network/port-publishing/), [Ubuntu firewall limitations](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)).

## Allocate ports automatically on the target

1. Reuse an existing service's recorded endpoint and host-port mapping. Allocation applies only to a new service or an explicitly requested remap. An unavailable existing endpoint is not permission to install a duplicate or move a shared port.
2. Before starting anything, the agent checks listeners **on the deployment host**: Linux `ss -ltn` (and UDP when required); Windows `Get-NetTCPConnection -State Listen` (and UDP when required). Also inspect Docker published-port mappings, including stopped containers, existing manifests/registries and ports reserved by this installation plan; Docker publication may not appear as an ordinary host listener. Account for wildcard and IPv4/IPv6 bindings. A refused client TCP connection does not prove that a remote port is free.
3. Try the documented preferred host port, then automatically select a free, non-reserved port in the operator's allowed range; without a range, check up to 100 successive non-privileged candidates starting at the preferred port, bounded by 65535. Do not ask the user to find a free number. Never kill an unrelated listener. If the range is exhausted, access is missing or availability cannot be established on the target, report that specific blocker; do not guess or fall back to the editor's ports.
4. Keep the image's internal service port unchanged. Render the chosen mapping as `-p <bind-ip>:<chosen-host-port>:<documented-container-port>` or its Compose equivalent; handle each required published port separately. For a fresh Compose installation, inspect the effective config so an override does not leave the default publication alongside the chosen one.
5. Immediately before launch recheck candidates; the actual bind/start is the final availability check. On an address-in-use race for a **new** service, inspect ownership, choose another candidate and retry at most twice, removing only failed resources created by this attempt. Never remap an existing shared service as recovery. Record the successful mapping and verify the resulting endpoint from the client machine, then the MCP handshake/tools; listening alone is not readiness.

## Persist and preserve the result

Keep a secret-free deployment record: target/context, host OS, installation root, bind address, per-service container name, host-to-container port mappings, full client MCP URL (including proxy/tunnel details), and persistent/source path mappings. Use existing installer settings/manifest fields when supported; otherwise keep an adjacent `mcp-deployment.json` and reference it from the project instructions. Do not invent provider environment variables or extend an external manifest's schema. External registry-owned ports are allocated through that installer's documented mechanism, never bypassed.

Write confirmed URLs into the active client's native config by merging selected entries only. Apply the same chosen values to launch settings, health checks and the deployment record; examples with localhost/default ports are templates, never overrides. A rerun reuses the recorded mapping. An update preserves it, including when replacing Compose files; reapply supported settings/overrides and inspect the effective publications before recreation. A shared address change requires updating its recorded consumers explicitly, not just the current editor.

Without administration access to a remote host, verify the actual endpoint from the client and report container/port checks as unavailable. Do not install local duplicates or diagnose a remote service from the local Docker daemon. Report the actual host, selected ports and full endpoints, separating configuration, HTTP reachability and MCP operation results.
