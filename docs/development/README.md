# Development And Validation

Run workspace commands from the repository root. `package.json` pins Bun 1.4.4.
In a fresh checkout or worktree, install the locked dependencies:

```bash
bun install --frozen-lockfile
```

Collection authors: see [collection examples](../blocs/examples.md) for v1 metadata,
reusable insertion examples and locally generated previews.

Provider authors: see [HTTP context and streaming](provider-http.md) for the generic receiver,
standard responses, validators and the compatible Content transition.

SDK authors: see [SDK releases](sdk-releases.md) for Emailer/SMTP, Secrets and Files,
inferred types and release preparation. [SDK runtime artifacts](sdk-runtime.md)
explains build output, startup attachment and authorization before durable replay.

## Local CMS

```bash
bun run ulvia -- configure network
bun run ulvia -- services start --version 1.0.7
bun run ulvia -- services status
bun run ulvia -- instance create preview
bun run ulvia -- instance credentials preview
bun run ulvia -- instance stop preview
bun run ulvia -- services stop
```

`1.0.7` is an example exact image version; choose a published version of
all required components. The source CLI reports `development` and has no
embedded default stack version, so first startup requires `--version`.
After initialization, `bun run ulvia -- start` reuses the installed digests.
Building workspace sources does not update those containers; follow the
explicit image build/publish and upgrade workflow below.

Standard installations use `https://repo.ulvia.fr` for the Provider's Repository
connection. Tests and offline development must select a local Repository
explicitly before initialization:

```bash
CMS_REPOSITORY_URL=http://repository:3000 \
CMS_REPOSITORY_ALLOW_INSECURE_HTTP=true bun run ulvia -- services start --version 1.0.7
```

In this example, `repository:3000` is a Repository CMS Edge address reachable
from the Provider containers. Core profiles `ulvia@1.2.0` and `repository@1.2.0`
initialize system APIs and an administrator from bundled artifacts before that
remote catalogue is available. They create no collections or Pages. Production
images contain the API-only snapshot; full snapshots with optional starters are
generated separately for authoring tests.

The connection is persisted in `services/installation.json` independently of
network exposure and client PAT connections. The Edge smoke supplies this
local override itself and never uses the public Repository.

The CLI manages shared services and any number of named Edge instances through
independent Docker Compose projects. It runs the same Edge and Provider images
for loopback and public installations, plus Nginx and MongoDB. A Repository is
an explicit CMS application profile with its own Edge. The CLI never starts
application servers inside its process. Data lives below `$XDG_DATA_HOME/ulvia` or
`~/.local/share/ulvia`; commands work from any directory. `ULVIA_DATA_DIR` is an
explicit isolation override for tests and CI. `ULVIA_HTTP_PORT`
and `ULVIA_PROVIDER_PORT` provide initial port defaults
for isolated tests. Persistent exposure is managed with
`ulvia configure network`; loopback HTTP and public HTTPS/ACME use the same
orchestrator and lifecycle commands. The Provider's internal Docker endpoint remains
`ulvia-provider:5103`. `start` is an
idempotent shortcut for the shared services and every previously created local
instance. It creates no default instance. `instance create` provisions the
Provider tenant and starts its dedicated Edge. Named instances use
`<name>.localhost` by default; public instances use
`instance create <name> --domain <domain>`. Services and instances have
separate stop and upgrade lifecycles.
Credential commands print only administrator credentials; technical tokens
remain private.

The CLI consumes released software images; it never builds them. Workspace and
CI authors build and publish the two official Docker Hub images explicitly:

```bash
bun run images:build --version 1.0.7 all
bun run images:publish --version 1.0.7 all
ulvia upgrade edge --version 1.0.7
ulvia upgrade provider --version 1.0.7
```

An upgrade pulls the canonical `docker.io/cyaxis` reference, validates its OCI
labels, and persists its immutable digest. A regular `start` reuses that digest;
it never upgrades by following a mutable tag. A failed activation attempts to
restart the previous image. This is best-effort image recovery, not a rollback
of persisted data, an automatic backup or a fleet-wide transaction. Edge
upgrades process instances in sequence; a later failure can leave earlier
instances upgraded. Collection, contract, and provider
manifest releases remain Repository artifacts and do not become Docker images.

Distribution versions are independent of official artifacts. Current core-only
profiles use `1.2.0`; the installations contract, Provider manifest, Mossa and
Repository collections use `1.1.0`, and other official contracts retain `1.0.0`. Existing npm
versions and Docker tags are retained rather than reused.

The host CLI is a separate public npm artifact. Its private workspace sources
are bundled so the published package has no `workspace:*` dependencies:

```bash
bun run cli:build --version 1.0.7 --stack-version 1.0.7
bun run cli:publish --version 1.0.7
bun add --global @cyaxis/ulvia@1.0.7
```

The build writes the package archive and a SHA-256 release receipt below
`artifacts/cli`. Publication targets `https://registry.npmjs.org/` explicitly,
requires npm credentials outside the repository, and refuses a changed archive.
The CLI and initial Docker stack versions are independent and both are sealed
into the receipt. Prereleases use the npm `next` tag; stable versions use
`latest`.

## Instance integration verification

[Workspace tests](../../tests/README.md) groups the cross-component journeys and
image checks. Package-owned tests remain with their packages.

The [instance integration tests](../../tests/integration/instance/README.md)
run an isolated real-image Docker journey covering MCP consent, collections,
files, Provider connections, observability, key rotation and revocation.
[Instance MCP V1](../architecture/instance-mcp.md) documents the tool scope and
OAuth routes. Build matching local images before running the opt-in test;
ordinary `verify` discovers and skips it when its image environment variables
are absent.

## Runtime Logs

Edge and Provider operator diagnostics use structured stdout/stderr.
Repository instances use those same runtimes and their own instance journal.
Instance diagnostics are collected through the selected Observability contract.
Inspect the last 200 matching instance records with:

```bash
ulvia instance logs default provider --level warn
ulvia instance logs default all --request-id <uuid>
ulvia instance logs default provider --event provider.operation.failed --stack
ulvia instance logs default all --json
ulvia instance logs default edge --follow
```

CMS instance journals are collected through the selected `ulvia/cms.observability` contract.
Use `/admin/observability` or `ulvia instance logs <name>` to search them. Filters run
in the selected Provider rather than on downloaded journal files. Production
processes also write structured stdout/stderr for startup and operator diagnosis;
`ulvia services logs provider` reads that container output. Application file
journals and per-runtime `ULVIA_LOG_*` settings have been removed.

See [CMS observability](../architecture/observability.md) for authority, bounded
collection, retention, pagination and delivery guarantees.

Each runtime injects a logger into coarse HTTP and process boundaries. Instance
loggers collect into their authenticated instance journal. The HTTP runner keeps only the current `requestId` in asynchronous
request context; this enriches nested records automatically without creating a
global logger or passing request metadata through domain APIs. The Edge
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

## Provider Control-Plane KEK Rotation

Provider deployments require `CMS_KEK_ACTIVE_ID` and a `CMS_KEK_RING_JSON`
object mapping explicit key IDs to 64-character hexadecimal AES-256 keys.
This is the only key configuration consumed by the runtime; no implicit key ID is assigned.
At startup, the Provider control-plane database is checked for persisted
DEKs whose wrapping keys are absent. The envelope helper supports rewrapping
with an audit ledger; this is not a CLI-managed key-rotation workflow.

Persisted DEK records require an explicit `keyId`; unversioned records are rejected.
There is no implicit key assignment or reader for the pre-versioning storage format.

Instance databases use their own key named `instance`, stored inside encrypted
Provider credentials. `ProviderInstanceHost` supplies that key with
`rotateOnStart: false`; changing the control-plane ring does not rotate each
instance's key. CLI Compose generates an explicit `control` key in the ring. It does not expose
operator-selected ring changes or the rotation flag through a lifecycle command.

For a directly configured Provider deployment, control-plane rewrapping is an
explicit maintenance operation:

1. stop the Provider and dependent Edges and verify a restorable backup;
2. keep the old keys configured, add the new key to `CMS_KEK_RING_JSON`, select
   it with `CMS_KEK_ACTIVE_ID`, and set `CMS_KEK_ROTATE_ON_START=true`;
3. start one Provider process and wait for the `cms_kek_rotation_audits` record to
   reach `completed`; listeners are not opened while the rotation runs;
4. set `CMS_KEK_ROTATE_ON_START=false` and restart the single-Provider deployment with
   both the active and historical keys still configured;
5. remove a historical key only after a later backup and startup verification
   prove that no `cms_deks` row references it.

The operation rewraps DEKs in bounded batches; it does not re-encrypt stored
secret values. Replaying it is idempotent. Historical keys are never deleted
automatically. Deployment-level restoration and historical-key recovery drills
remain [open work](../TODO.md#backup-and-operational-recovery).

## Checks And Build

| Command | Purpose |
| --- | --- |
| `bun run check:all` | Architecture, UI contracts, repository shape, style, workspace types, dead code and tooling types. |
| `bun run verify` | Run static checks, build browser assets, regenerate official bootstrap artifacts, run the Bun test suite and check performance budgets. |
| `bun run verify:full` | Run `verify`, then the complete local Edge browser journey and Docker delivery performance budgets. |
| `bun run check:dead-code` | Report unused declarations, exports, exported types and package dependencies. |
| `bun run check:logging` | Reject server-side `console` references and unstable logger event names outside approved presentation boundaries. |
| `bun run check:style` | Read-only Biome check. |
| `bun run format` | Apply Biome formatting and configured safe/unsafe fixes; inspect the diff. |
| `bun run typecheck` | TypeScript project-reference check/build. |
| `bun run build` | Build TypeScript references and Content browser runtimes, then regenerate the official CLI bootstrap snapshot. |
| `bun run cli:build --version <cli-version> --stack-version <stack-version>` | Bundle and verify the installable `@cyaxis/ulvia` npm archive with its independent initial stack version. |
| `bun run cli:publish --version <version>` | Publish an unchanged, previously built CLI archive to the public npm registry. |
| `bun run images:build --version <version> all` | Build all official Cyaxis/Ulvia Docker images locally. |
| `bun run images:publish --version <version> all` | Publish verified official images to Docker Hub. |
| `bun run test` | Run maintained tests under `quality/`, `tests/` and `packages/`. |
| `bun run test:edge-smoke` | Exercise a fresh local Edge installation, representative mutations and restart through Chromium. |
| `bun run clean` | Clean TypeScript build state, then remove every package `dist` and `tsconfig.tsbuildinfo`. |

`check:all` remains the fast aggregate static check; it does not execute the
application test suite or browser scenarios. Use `verify` before handing off a
code change. Use `verify:full` when the complete Provider, instance and Edge
journey is in scope. Browser/network integration tests require an environment
that permits Chromium and local listeners.

The fresh-install Edge smoke test additionally requires Docker Compose and
Chromium. It builds the Edge and Provider images from the current checkout using
the local tag `0.1.0-edge-smoke`, validates their OCI labels and immutable
repository digests, and prepares the admitted official and fixture catalogue
in an isolated temporary CLI data directory. Installation state, image pins,
service credentials, Provider instances and CMS site data are created by the normal
CLI flow. Nothing is pushed to a registry. Local image manifests must be
available by digest (for example with Docker's containerd image store).

To reuse an already built matching pair, set
`ULVIA_SMOKE_IMAGE_VERSION=<local-version>` explicitly. This skips image builds
but still verifies each component, stack API, version and digest. Without that
override, `bun run verify:full` builds and tests the candidate source directly.
The smoke is opt-in locally. Quality runs on pull requests and pushes to
`codex/alpha-v0`; a separate nightly/manual workflow runs the same journey
without duplicating the PR/push run. Both also run the Docker delivery budgets.
See [security and performance guardrails](guardrails.md) for reports, scope
selection, measured budgets and remaining limits.

### Known Verification Blockers

The setup action now builds the browser runtime and official bootstrap with
current commands. Candidate smoke images use an explicit version. The coverage
baseline still needs reconciliation with the current package set; remote CI
and dependency-security checks must not be described as passing based on local
verification alone.

Many Mongo adapter tests use doubles. Namespace ownership and PAT quotas also
have opt-in real Mongo tests covering concurrent processes, account/instance
isolation and bounded indexed reads. Wider adapter interruption, transactions
and full restore still need environment-level coverage. The
[audit](../AUDIT.md) records successful local checks and confirmed gaps.
Performance work should gate calls, transferred bytes and retained resources;
`verify` now runs `test:performance` with machine-dependent timing ceilings,
while `verify:full` also runs the real Docker delivery budget journey.

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

[Page performance and headless hosts](page-performance.md) documents the local
performance regressions and the optional Cirrus framebuffer mitigation.

[Repository performance](repository-performance.md) documents catalogue timings,
HTTP/storage work budgets and the isolated official-collection benchmark.

The maintained test command scopes discovery to those three source trees.
Generated historical copies under `artifacts/` are retained as evidence and are
not executable inputs to the current suite. Plain `bun test` uses Bun's broader
automatic discovery and can also execute those archival copies.

Fresh core profiles expose optional native setup at `/.cms/setup`. The full Edge
smoke explicitly publishes current collections, applies the Repository recipe
through the API and selects Mossa through the native browser flow. See
[Provider instance initialization](../architecture/provider-instance-initialization.md)
for review, authority, limits and recovery guarantees.
