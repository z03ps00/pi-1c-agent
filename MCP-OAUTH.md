# MCP OAuth in this profile

Applies to external MCP servers registered with `auth: "oauth"` in `mcp.json`. The client
is `pi-mcp-adapter`; credentials live in the OS credential store, never in this repo.

Everything below was verified empirically on 2026-09-15 against a Keycloak realm
(`mcp-pilot`) whose client-registration policy enforces trusted hosts — a configuration
that rejects the adapter's defaults, so it is a good stress test.

## Connecting a new OAuth server

1. **Recon, read-only.** `GET <url>` answers `401` plus
   `WWW-Authenticate: Bearer …, resource_metadata="…/.well-known/oauth-protected-resource"`.
   Take `authorization_servers` and `scopes_supported` from that metadata and the
   authorization-server document.

   Never probe connectivity by `POST`ing to the registration endpoint
   (`…/clients-registrations/openid-connect`): Keycloak treats even an empty `{}` as a
   registration request and creates a client.

2. **Server block** in `mcp.json` (see the machine-local section below — do not commit it):

   ```json
   "some-server": {
     "url": "https://mcp.example.com/mcp",
     "auth": "oauth",
     "oauth": {
       "scope": "openid offline_access <tool-scope>",
       "clientUri": "http://localhost",
       "redirectUri": "http://127.0.0.1:3118/callback"
     },
     "lifecycle": "keep-alive",
     "requestTimeoutMs": 120000,
     "httpTransport": "streamable-http"
   }
   ```

3. **`/reload`.** The server list and the per-server definitions are a snapshot taken when
   the session starts. Until a reload, a newly added server answers `not found` and
   `auth-start` keeps using the previous definition.

4. **`mcp({ action: "auth-start", server: "some-server" })`** returns the authorization URL
   (state, PKCE and `redirect_uri` are already baked in). Hand that URL to the user.

5. **User signs in.** With a `127.0.0.1` redirect the adapter catches the code itself and
   the browser shows "Authorization Successful" — nothing to copy. For `https` callbacks or
   when loopback fails, finish manually:
   `mcp({ action: "auth-complete", server: "some-server", args: { redirectUrl: "<full address-bar URL>" } })`.

6. **Verify:** `mcp({ connect: "some-server" })` → tool list → one live call. A token alone
   is not evidence; call a tool.

## Pitfalls

### Registration rejected: `403 Policy 'Trusted Hosts'`

Dynamic client registration sends `client_uri`. With no manifest, `defaultClientUri()`
returns the adapter's own GitHub repository, and a realm with a trusted-host policy rejects
the request before the login page ever appears.

This profile ships `manifest/package.json` with `piConfig.clientUri = "http://localhost"`.
Point the launcher at it:

```cmd
set "PI_PACKAGE_DIR=%PI_CODING_AGENT_DIR%\manifest"
```

Check it without a browser (expect `pi http://localhost <profile dir>`):

```powershell
$env:PI_PACKAGE_DIR="$env:PI_CODING_AGENT_DIR\manifest"
node -e "const m=await import('file:///' + process.env.PI_CODING_AGENT_DIR.replace(/\\\\/g,'/') + '/npm/node_modules/pi-mcp-adapter/dist/agent-dir.js');console.log(m.getAppName(),m.getAppClientUri(),m.getAgentDir())"
```

Keep `piConfig.name` out of that manifest: the adapter resolves its agent dir from
`<NAME>_CODING_AGENT_DIR`, so rebranding silently moves it to `~/.pi/agent`.
Individual servers can be pinned with `oauth.clientUri` as well.

### Callback never reaches the adapter

The adapter binds exactly the host from `redirectUri`; the default is `localhost`, which on
Windows Node binds to `::1` only, while browsers try `127.0.0.1` first. The code is then
stranded in the address bar.

Fix: `oauth.redirectUri` with an explicit `127.0.0.1` and port. Use a **different port per
server** — the callback server is shared and only one authorization flow is live at a time —
and make sure the port is free: a configured `redirectUri` is bound strictly.

### Token without tool scopes (`403 insufficient_scope` on tools)

Without `oauth.scope` the adapter registers a client with the realm's default client scopes
only, which carry no tool scopes. The configured scope is sent both to registration and to
the authorization request. Available groups are listed in `scopes_supported`.

### Probe clients pile up in the realm

Registration responses carry `registration_access_token` and `registration_client_uri`.
Delete a throwaway client with `DELETE <registration_client_uri>` and
`Authorization: Bearer <registration_access_token>` (RFC 7592). Save the token before
losing it — a client created without it can only be removed by a realm administrator.

## Machine-local files

`mcp.json`, `settings.json` and `models-store.json` diverge in every clone on purpose:
local ports and server choices, the absolute in-repo path filled by `scripts/setup.mjs`, and
Pi's own runtime `checkedAt`. Never commit them — the profile's canonical shape is
`mcp.example.json` plus the opt-in fragments in `mcp.optional/`.
