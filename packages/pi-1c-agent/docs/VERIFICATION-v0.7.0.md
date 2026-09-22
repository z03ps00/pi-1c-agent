# Verification — v0.7.0

First tagged GitHub release. Package version `0.7.0`.

## Automated tests

Run from `packages/pi-1c-agent`:

- Full suite (`npm test`): **204/204 PASS**.
- Typecheck (`npm run typecheck`): runtime `.mjs` and seven extension `.ts` files parse.
- Public-tree scan: **clean**.
- Package doctor (`npm run doctor:package`): **CORE: PASS**.

New coverage since v0.6.1 includes:

- deceptive ASK/PLAN tool names (`get_and_delete`, `query_and_update`, …) are denied;
- `/approve safe` treats unproven shell as dangerous (`rm --recursive --force`, `git restore`, `find -delete`);
- session-approval scope is tool + risk + target, not the whole `bash` category;
- exact `.dev.env` values and AWS/GitLab/npm credential families never reach a remote distiller;
- child stdout keeps a bounded tail; a 32 MiB chunk does not retain an oversize frame;
- child process environment is an allowlist, not a copy of `process.env`;
- process-tree termination uses a POSIX group or Windows `taskkill /T`;
- Cognee transport ACK without read-back is `accepted`, not `recorded`;
- duplicate memory-queue reconstruction prefers `done` over `failed`.

## TypeScript entrypoints

Parsed with `node --experimental-strip-types --check`:

- `extensions/1c-mode/index.ts`
- `extensions/1c-subagents/index.ts`
- `extensions/1c-admin/index.ts`
- `extensions/1c-knowledge/index.ts`
- `extensions/1c-init/index.ts`
- `extensions/1c-session-rotate/index.ts`
- `extensions/1c-memory/index.ts`

## Runtime requirements

- Node.js `>=22.19.0` (CI: 22.19, 22, 24 on Linux and Windows).
- Pi peer range `>=0.85.0 <0.86.0`.

## Safety invariants for this release

- Unknown custom tools are denied in ASK/PLAN unless they are on the explicit read-only inventory.
- Remote session distillation and memory writes share the same secret egress filter.
- `/approve` is a UX guard, not an OS sandbox.
- `recorded` requires read-back; Cognee ACK alone is `accepted`.
