# Development And Validation

Run workspace commands from the repository root. `package.json` pins Bun 1.4.2.
In a fresh checkout or worktree, install the locked dependencies:

```bash
bun install --frozen-lockfile
```

## Local CMS

```bash
bun run ulvia -- dev new
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev logs --level warn
bun run ulvia -- dev stop
```

The CLI manages a persistent local stack with MongoDB, an Ulvia Provider, a CMS
Kernel and an immutable resource repository. `dev new` associates the current
project with private data below the user data directory. Later commands resolve
that association automatically, including from project subdirectories.
`ULVIA_DATA_DIR` explicitly overrides project resolution; `ULVIA_DEV_KERNEL_PORT`,
`ULVIA_DEV_MONGO_PORT`, and
`ULVIA_DEV_REPOSITORY_PORT` override the local ports. `release` validates an
authored collection, contract, or provider manifest into the local immutable
repository. `push` and `pull` transfer exact coordinates to and from a compatible
HTTPS repository; `yank` and `restore` manage reversible catalogue availability.
`dev` idempotently provisions the local instance through the Provider operator
API, installs the official profile and starts its Kernel. `dev credentials`
prints only the administrator email and password; repository, operator and
instance tokens remain in the private local runtime directory.

## Runtime Logs

Kernel, Provider, repository, and development-supervisor diagnostics use the
shared structured logger. Local development keeps private rotating NDJSON files
below `<data>/dev/logs` at `debug` level while the terminal defaults to the less
noisy `info` level. Inspect the last 200 matching records with:

```bash
ulvia dev logs
ulvia dev logs provider --level warn
ulvia dev logs all --request-id <uuid>
ulvia dev logs provider --event provider.operation.failed --instance-id <uuid> --stack
ulvia dev logs all --json
ulvia dev logs kernel --follow
```

`ULVIA_LOG_LEVEL` accepts `trace`, `debug`, `info`, `warn`, `error`, or `fatal`.
In local development it controls the private journal; `ULVIA_LOG_CONSOLE_LEVEL`
independently controls terminal verbosity and defaults to `info`.
`ULVIA_LOG_FORMAT` accepts `pretty` or `json`. Production runtimes default to
JSON on stdout/stderr; deployment infrastructure remains responsible for
collecting and retaining that stream. The synchronous rotating file journal is
reserved for local `MODE=DEV` runtimes and is configured automatically by
`ulvia dev`; production runtimes ignore `ULVIA_LOG_FILE`. Invalid logging
configuration is reported as a structured warning before the safe default is
used.

Logging is diagnostic, bounded, and centrally redacted. It does not replace
durable domain audit records, metrics, or traces. Remote telemetry is not sent:
future support bundles or telemetry exporters must remain opt-in and apply a
second redaction pass before leaving the machine.

Each runtime owns its logger and injects it only into coarse HTTP or process
boundaries. The HTTP runner keeps only the current `requestId` in asynchronous
request context; this enriches nested records automatically without creating a
global logger or passing request metadata through domain APIs. The Kernel
forwards the same `x-request-id` to the Provider, and the Provider runtime
forwards it to repository requests through an injected transport. Provider operation identifiers
such as `x-ulvia-request-id` remain separate because they describe a durable
operation rather than one HTTP journey.

Use stable lowercase event names such as `provider.query.failed`; the static
logging check rejects dynamic names and prose on conventional logger receivers
and declarations typed as `Logger`. Put only bounded identifiers,
counts, statuses, durations, and safe classifications in attributes. Never log
request or response bodies, credentials, tokens, cookies, authorization
headers, personal data, or provider inputs. Create child loggers for durable
component scope. Request IDs and internal request-stage timings are attached by
the HTTP boundary; a request ID is diagnostic correlation only and must never be
used as identity or authorization evidence. Tests that intentionally suppress
diagnostics pass `NOOP_LOGGER` explicitly.

## Local KEK Rotation

`CMS_KEK_HEX` remains the backward-compatible key named `legacy`. A versioned
deployment may additionally set `CMS_KEK_ACTIVE_ID` and a
`CMS_KEK_RING_JSON` object whose values are 64-character hexadecimal AES-256
keys. At startup, the server scans every persisted DEK and refuses readiness if
one references a key absent from the configured ring.

A supported rotation is an explicit maintenance operation:

1. stop all CMS replicas and verify a restorable backup;
2. keep the old keys configured, add the new key to `CMS_KEK_RING_JSON`, select
   it with `CMS_KEK_ACTIVE_ID`, and set `CMS_KEK_ROTATE_ON_START=true`;
3. start one CMS process and wait for the `cms_kek_rotation_audits` record to
   reach `completed`; listeners are not opened while the rotation runs;
4. set `CMS_KEK_ROTATE_ON_START=false` and restart the normal replica set with
   both the active and historical keys still configured;
5. remove a historical key only after a later backup and startup verification
   prove that no `cms_deks` row references it.

The operation rewraps DEKs in bounded batches; it does not re-encrypt stored
secret values. Replaying it is idempotent. Historical keys are never deleted
automatically.

## Checks And Build

| Command | Purpose |
| --- | --- |
| `bun run check:all` | Architecture, UI contracts, repository shape, style, workspace types, dead code and tooling types. |
| `bun run verify` | Run every static workspace check, then the complete Bun test suite. This is the default pre-handoff command for code changes. |
| `bun run verify:full` | Run `verify`, then exercise the complete local Kernel browser journey. |
| `bun run check:dead-code` | Report unused declarations, exports, exported types and package dependencies. |
| `bun run check:logging` | Reject server-side `console` references and unstable logger event names outside approved presentation boundaries. |
| `bun run check:style` | Read-only Biome check. |
| `bun run format` | Apply Biome formatting and configured safe/unsafe fixes; inspect the diff. |
| `bun run typecheck` | TypeScript project-reference check/build. |
| `bun run build` | Build TypeScript references and the browser runtimes owned by `cms-content`. |
| `bun test` | Run the test suite. |
| `bun run test:kernel-smoke` | Exercise a fresh local Kernel installation, representative mutations and restart through Chromium. |
| `bun run clean` | Clean TypeScript build outputs through `tsc --build --clean`. |

`check:all` remains the fast aggregate static check; it does not execute the
application test suite or browser scenarios. Use `verify` before handing off a
code change. Use `verify:full` when the complete Provider, instance and Kernel
journey is in scope. Browser/network integration tests require an environment
that permits Chromium and local listeners.

The fresh-install Kernel smoke test additionally requires Docker Compose. It is
opt-in locally and runs for every pull request, every push to `master`, every
night and on demand through the dedicated GitHub Actions workflow.

`check:dead-code` exits with a failure when it finds unused declarations,
exports, exported types or package dependencies. Public exports can be
intentional; confirm their package contract before removing them.

For code changes, capture `check:all` before the work and run `verify` after it
in the same workspace. Address introduced errors and inspect new warnings in
scope.
Documentation-only changes normally need a diff whitespace check and validation
of moved links; check executable examples when their behavior changes.

The [root agent instructions](../../AGENTS.md) define editing/validation rules.
[UI contracts](../quality/ui-contracts.md) explains scanner scope and limitations.
[Commit messages](commits.md) records the suggested convention.
