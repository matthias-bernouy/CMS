# Development And Validation

See [visual captures](visual-captures.md) for MCP images and isolated browser prerequisites.

Run workspace commands from the repository root. `package.json` pins Bun 1.4.4.
In a fresh checkout or worktree, install the locked dependencies:

```bash
bun install --frozen-lockfile
```

Collection authors: see [collection examples](../blocs/examples.md) for v1 metadata,
reusable insertion examples and locally generated previews.

Provider authors: see [HTTP context and streaming](provider-http.md) for the generic receiver,
standard responses, validators and the compatible Content transition.

SDK authors: see [SDK releases](sdk-releases.md) for feature definitions,
inferred types and release preparation. [SDK runtime artifacts](sdk-runtime.md)
explains build output, startup attachment and authorization before durable replay.

The [2026-11-17 performance assessment](performance-assessment-2026-11-17.md)
records the initial capability measurements, reproduced defects and remaining
coverage work. It is an interim report; its historical counts do not certify
the current checkout.

The [focused initialization-plan measurements](initialization-plan-performance-2026-11-17.md)
cover HTTP/MCP, cold starts, concurrency and representative recipe volumes.
The [initialization-plan optimization assessment](initialization-plan-optimization-2026-11-17.md)
records bounded verification reuse, before/after timings and remaining cold-start costs.
The [cold initialization follow-up](initialization-plan-cold-optimization-2026-11-17.md)
records the DOM, expansion and preview changes with a second comparative Docker campaign.
The [limited admission parsing experiment](admission-document-reuse-2026-11-17.md)
records a rejected cache candidate whose local parsing reduction did not produce a validated request-level gain.
The [30-call cold stability campaign](initialization-plan-stability-2026-11-17.md)
records successful HTTP/MCP invocations, early latency spikes and container memory observations.

See [CLI deployment lifecycle](deployment-lifecycle.md) for command semantics,
applied snapshots, release integrity and recovery.
The [2026-11-10 validation report](cli-deployment-validation.md) records the
implementation checks and remaining extended Docker failures.

## Local CMS

```bash
bun run ulvia -- configure --show
bun run build --version 0.1.0-shared-hosting
bun run ulvia -- configure --domain control.localhost
bun run ulvia -- apply --version 0.1.0-shared-hosting
bun run ulvia -- status
bun run ulvia -- configure --edges 2
bun run ulvia -- apply
bun run ulvia -- stop
```

The example builds compatible local images without publishing. Released images
must advertise the shared-hosting API. The source CLI reports `development` and has no
embedded default stack version, so first apply requires `--version`.
After initialization, `bun run ulvia -- start` reuses the installed digests.
Building workspace sources does not update those containers; follow the
explicit image build/publish and upgrade workflow below.

Control is created automatically and starts empty. Startup prints the path to its
private initial administrator file; it never prints the password. Open
`http://control.localhost:5100/.cms/setup`, authenticate, select a Repository and choose
an empty site or an explicitly authored collection. Create other logical sites
through `ulvia/cms.hosting` HTTP/MCP bindings; the CLI manages infrastructure.

The native `/.cms/setup` offers a custom Repository address, the official
Repository (`https://repo.ulvia.fr`), or a new Registry on this instance. Settings
are persisted per instance, independently of shared services and client PAT
connections. No global Repository URL environment variable is read. System
provisioning uses bundled SDK artifacts offline and creates no collections or
Pages. Tests publish small collection fixtures explicitly; no starter is bundled.
The Edge smoke selects its isolated Registry through the same setup screen.

Reviewed collection upgrades validate links against their captured Page snapshot.
They reuse bounded fragment indexes within that review (128 entries, 8 MiB),
while preserving per-source document budgets and current route checks. Ordinary
Page edits still read at most 32 destinations. Neither path crawls linked Pages.
The inventory also reuses repeated immutable markup within an 8 MiB, 128-entry
cache, retaining every reference location. The Edge waits up to 60 seconds for
an administrator's direct `plan-collection-upgrade` query; other calls retain
their 15-second first-byte limit. Delegation and invocation-token lifetimes are
unchanged. The Provider uses a 60-second HTTP idle timeout.

The CLI manages one Compose project containing Provider, MongoDB, Caddy and a
configured shared Edge pool. Every CMS instance, including Registry, uses this
pool. Creating or disabling a tenant changes domain state without starting or
stopping an infrastructure process. The CLI owns no application listener.
Data lives below `$XDG_DATA_HOME/ulvia` or `~/.local/share/ulvia`;
`ULVIA_DATA_DIR` isolates tests. `ULVIA_HTTP_PORT` and `ULVIA_PROVIDER_PORT`
provide initial test ports. `ulvia configure` persists desired network, Control
origin and Edge settings without running Docker. `ulvia apply` deploys them. The Provider's
internal endpoint is `ulvia-provider:5103`. Repeated `start` reopens the same
installation, Control identity, credentials and exact image pins.

The CLI consumes released software images; it never builds them. Workspace
authors build a complete distribution and publish its artifacts explicitly:

```bash
bun run build --version 1.0.7
bun run publish --version 1.0.7
ulvia upgrade --version 1.0.7
```

Publish both images and the CLI under the same distribution version. The CLI
archive contains a digest-checked stack release with exact deployment definitions
and pinned Caddy/MongoDB images. `upgrade --version` reads that release from the
official npm archive and verifies registry SHA-512 integrity before preparing the
new deployment. `apply` retains the applied release when changing configuration.
`start` uses only recorded artifacts and existing containers; upgrading the CLI
does not change the installation until an explicit `apply` or `upgrade`.

Desired settings, the last applied snapshot and an unfinished deployment are
distinct. The operation is journaled before Docker writes; successful activation
records the new snapshot. Failures retain their exact target for `apply`/`upgrade`
recovery and never claim the whole release is active. Updates are not a data
rollback. No commands upgrade an individual Provider or Edge anymore.

The versioned workspace build gives Edge, Provider and the CLI one shared
distribution version. Contract and Provider manifest versions evolve independently.
Versions are explicit in each feature definition and the Provider manifest source.
Existing npm versions and Docker tags must not be assigned different release bytes.

The host CLI is a separate public npm artifact. Its private workspace sources
are bundled so the published package has no `workspace:*` dependencies:

```bash
bun run publish --version 1.0.7
bun add --global @cyaxis/ulvia@1.0.7
```

The build writes the archive and its single receipt directly into
`artifacts/distributions/<version>/cli/`, alongside the isolated official catalogue
in `repository/`. The receipt records the CLI SHA-256, Git revision, local image
identities and one SHA-256 over the sorted catalogue paths and file hashes. It has
no schema/dialect marker or duplicated resource inventory. This directory is ignored by Git.
Builds never change the personal CLI release cache or running installations.

`publish --version` consumes only that snapshot. It verifies all files, both image
identities, the saved Repository connection and npm's existing version before
publishing contracts in dependency order, the Provider manifest, both images, and
finally the exact CLI tarball. Repository publication uses the connection established
by `bun run ulvia -- repository login <url>`; Docker and npm use their normal
external credentials. It never calls `push all` against the personal release cache.

The three destinations are not one transaction. On failure, repeat the same
`publish --version`: Repository retries are idempotent, Docker retries push the
same local images, and an existing npm version succeeds only when its SHA-512
integrity matches the built archive. Changed artifacts or npm content conflicts fail.
No build or source regeneration runs during publication. Incomplete or older build
receipts missing image identities or the catalogue fingerprint require a new build. The CLI and initial Docker
stack share the distribution version; contract and manifest versions remain independent.
Prereleases use npm's `next` tag; stable versions use `latest`.

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
Read an instance journal through the selected `ulvia/cms.observability`
HTTP/MCP capabilities: `logs.query` lists filtered summaries, `logs.get` loads
one entry and `logs.aggregate` returns bounded counts. These reads require a
current administrator in that instance. See [observability](../architecture/observability.md#consultation)
for filters and pagination.

Inspect the shared runtime container output with:

```bash
ulvia logs --filter component=provider
ulvia logs --filter service=edge-1 --follow
ulvia logs --filter component=proxy
```

No observability administration Page is bundled. Journal filters run in the
selected Provider rather than on downloaded journal files. Shared runtime
stdout/stderr contains startup and operator diagnostics; it is distinct from
each instance's journal. Application file
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
still require deployment-level verification.

## Checks And Build

| Command | Purpose |
| --- | --- |
| `bun run ulvia -- <arguments>` | Prepare metadata/browser assets and run the source CLI. |
| `bun run format` | Apply Biome formatting and configured safe/unsafe fixes; inspect the diff. |
| `bun run check` | Run every static diagnostic, including types, architecture, style and dead code. |
| `bun run test [paths/options]` | Prepare metadata/browser assets, then run maintained Bun tests, or selected tests. |
| `bun run verify` | Run static checks, tests, [real Mongo Content lifecycle regressions](../../tests/integration/content/README.md), performance-plan guards, retained compatibility, the shared-hosting browser journey and isolated TLS issuance/restart. |
| `bun run perf [--list] [--scenario <id> ...] [--reference <run-id>]` | List or execute the separate measured performance campaign, with explicit targeted scope and optional regression comparison. |
| `bun run build [--version <version>]` | Build workspace outputs; with a version, also build images, the CLI and an exact publication snapshot. |
| `bun run publish --version <version>` | Publish only the previously built snapshot to Repository, Docker and npm. |
| `bun run clean` | Clean TypeScript build state and package `dist`/`tsconfig.tsbuildinfo` outputs. |

`check` is the fast static pass. It preserves every diagnostic and reports elapsed
seconds per check; `--verbose` and `--base <ref>` control reporting. There is no
individual-check selector. `test` is the normal iteration loop and accepts Bun
paths and options, for example `bun run test ./tests/operations`.

`verify` is the functional and static automated acceptance pipeline. Measured
performance campaigns run separately through `perf`. It requires
Docker Compose, Chromium and local listeners; missing prerequisites fail the
command. Bootstrap and browser outputs are prepared once per command before the
stages that consume them. Individual internal entrypoints remain directly callable
for diagnosis; they are not additional root aliases.

`verify` builds one candidate Edge/Provider pair tagged `0.1.0-verify` from the
current checkout and reuses it for the functional browser and TLS stages. It
validates OCI component/API/revision labels and exact image identities. Local
image manifests must be available by digest (for example with Docker's containerd
image store). Each journey uses disposable services and isolated client data;
nothing is pushed to a public registry.

The ordinary `test` command leaves these acceptance journeys opt-in. For focused
diagnosis, call the internal entrypoints directly. The smoke accepts
`ULVIA_SMOKE_IMAGE_VERSION`, delivery accepts both `ULVIA_MCP_EDGE_DOCKER_IMAGE`
and `ULVIA_MCP_PROVIDER_DOCKER_IMAGE`, and TLS accepts `ULVIA_TLS_TEST_IMAGE`.
Those explicit image overrides are for the internal runners; `verify` always
builds its current candidate once. This repository has no GitHub Actions workflows.

See [security and performance guardrails](guardrails.md) for reports, scope
selection, measured budgets and remaining limits.

### Known Verification Blockers

Candidate smoke images use an explicit version. The coverage baseline still
needs reconciliation with the current package set. Dependency-security checks
are separate commands and must not be described as passing based on unrelated
local verification.

Many Mongo adapter tests use doubles. Namespace ownership and PAT quotas also
have opt-in real Mongo tests covering concurrent processes, account/instance
isolation and bounded indexed reads. Wider adapter interruption, transactions
and full restore still need environment-level coverage.
Performance work should gate calls, transferred bytes and retained resources;
`verify` checks the performance harness and static scenario coverage; `perf`
enforces measured budgets and runs the real Docker delivery budget journey.
`perf --list` needs no Docker stack; selected scenarios share one isolated stack
and report coverage only for their exact selection. Candidates use the separate
local `0.1.0-perf` tag. Without a reference, absolute budgets still apply; an
explicit `--reference` or `ULVIA_PERFORMANCE_REFERENCE` requires compatible
measurement evidence. These commands never publish images or deploy sites.

The dead-code diagnostic included in `check` exits with a failure when it finds unused declarations,
exports, exported types or package dependencies. Public exports can be
intentional; confirm their package contract before removing them.

For code changes, capture `check` before the work and run `verify` after it
in the same workspace. Address introduced errors and inspect new warnings in
scope.
Documentation-only changes normally need a diff whitespace check and validation
of moved links; check executable examples when their behavior changes.

The [root agent instructions](../../AGENTS.md) define editing/validation rules.
Existing Content databases can require an explicit offline projection upgrade.
See [Content maintenance](content-storage.md)
for `bun run content-storage` commands, interruption recovery and prerequisites.
[UI contracts](../quality/ui-contracts.md) explains scanner scope and limitations.
[Commit messages](commits.md) records the suggested convention.

[Page performance and headless hosts](page-performance.md) documents the local
performance regressions and the optional Cirrus framebuffer mitigation.

[Repository performance](repository-performance.md) documents catalogue timings,
HTTP/storage work budgets and the isolated SDK/test-collection benchmark.

The maintained test command scopes discovery to those three source trees.
Generated historical copies under `artifacts/` are retained as evidence and are
not executable inputs to the current suite. Plain `bun test` uses Bun's broader
automatic discovery and can also execute those archival copies.

Fresh instances expose optional native setup at `/.cms/setup`. The Edge
smoke completes empty setup, explicitly publishes and installs a test collection,
then creates, publishes, reloads and deletes a Page through public APIs and Chromium. See
[Provider instance initialization](../architecture/provider-instance-initialization.md)
for review, authority, limits and recovery guarantees.

[Gateway control performance](gateway-control-performance.md) describes the admitted
compact-route protocol, bounded definition cache and revision-fenced MCP index.
