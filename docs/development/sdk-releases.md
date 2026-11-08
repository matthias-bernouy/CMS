# SDK release workflow

The shared SDK inventory includes Emailer/SMTP, Access, Content, Authoring,
Secrets, Files, Observability, Repository, Installations and Provider controls.
Reusable Zod schemas, named mocks, bindings and default execution live with their
owning feature. Normal `docs/**/*.md` files are discovered only during compilation.
The Provider selects complete implementations and injects runtime-owned adapters.
The `provider.cms-instances` definition is a published template without an execution claim.

## Sources and generated artifacts

`infra/releases/ulvia.release.ts` is the explicit trusted local source entry.
It generates every official contract and its assets from the SDK inventory,
prepares the remaining authored collections, and derives manifest claims with exact
digests and implementation requirements. Compilation captures executors without
invoking them. Runtime mounting binds injected service ports.
Retained contract/provider JSON files are immutable parity references; generation
never scans or falls back to those definitions.

```sh
bun run generate:official-bootstrap
bun run release:official
# Explicit publication through the configured, authenticated Repository connection:
bun run ulvia -- push all
```

Bootstrap and local release preparation share `prepareOfficialResources`.
Bootstrap emits admitted documents/assets and the Provider snapshot. It also
regenerates the runtime's current execution support pins from the manifest and
runtime package version. Executable support contains only those shipped SDK claims.
Historical API signatures remain compatibility evidence; older digests absent from
the runtime artifact refuse execution. Merely admitting a release cannot add support.
The resource ZIP and removal of collections are separate work.

## Versions and publication

Versions are explicit source data: each `src/feature.ts` owns its contract version and
the surface’s `src/exports/provider/definition.json` owns the manifest version/provenance. Compilation never invents
versions or publication timestamps. Update the corresponding source version
before releasing changed bytes. The ordinary catalogue checks immutable exact
coordinates, SemVer evolution, capability identities and exact parent pins.
A matching retry reuses the same immutable release.

`ulvia release <directory>` recognizes `ulvia.release.ts`; `--recursive` discovers
such roots alongside JSON resource roots and stops at each owned subtree. A module
default-exports an async function returning admitted `PreparedResource[]`, whose
public type is exported by `@bernouy/ulvia-cli/releases`. This executes trusted
local workspace code, not remotely supplied TypeScript. Remote authoring stays
data-only. Ambiguous JSON/module roots and symbolic module files reject.

Every module artifact is admitted again before local storage. The complete batch
is bounded to 256 resources and 512 MiB of canonical bytes/assets. Contract and
Provider history checks run before the first write. Storage failure can leave a
partial batch; retry identical coordinates. `push all` separately preflights local
artifacts and credentials, then uses the existing Repository publication protocol.
It publishes all non-yanked artifacts in the selected local cache, including any
previously prepared resources. Preparation never publishes remotely.

## SMTP replay and uncertain delivery

`registerOfficialFeatures` mounts the selected SDK implementations through
`registerProviderHandlers` in the existing
Provider registry. The authenticated receiver supplies exact invocation identity;
registration checks the mounted site/Provider/instance before executing a handler.
The host still authorizes every invocation, including receipt replays.

The runtime claims a Mongo receipt with majority journaled writes before sending.
Keys bind Provider, instance, site, concrete contract/version and capability.
A fingerprint binds the input and authenticated principal; reusing a key for a
different message or actor refuses without another send. The parent alias and
concrete SMTP route share the same concrete execution receipt.

A completed result or declared failure replays after runtime recreation. A pending
receipt never expires or transfers ownership. A crash after SMTP acceptance but
before completion leaves delivery uncertain and refuses automatic resend. This
avoids silently duplicating mail; it does not promise exactly-once SMTP delivery.
No operator resolution API is implemented yet. Reconciliation requires checking
the external delivery outcome before deliberately initiating a new command.

Receipts retain hashes and small outcomes, never mail bodies or SMTP credentials.
They are not automatically pruned because expiry would permit duplicate sends.
Each instance admits at most 128 pending executions in memory; receipts have a
16 KiB outcome bound. A successful new command uses one insert and one update;
a replay or conflict uses a duplicate insert attempt and one indexed lookup.
SMTP adds no receipt scan, process cache or extra authentication/authorization pass.
The synchronous JSON adapter covers Emailer send and Secrets creation/rotation.
Secrets adds a fresh namespace permission check before receipt access, including
replay. Streamed commands and general receipt administration remain outside these pilots.

## Feature source layout

Features expose the complete `./feature`, business ports/errors on the package root,
and useful adapter subpaths. Schema and capability construction files stay internal. Keep reusable Zod data
models under `src/schemas/`; infer port types directly from them. Each capability
has its own descriptor under `src/capabilities/`, grouped by domain such as
`configuration/get.ts`. Read/write/storage projections derive from shared fields;
private storage schemas remain internal. Business normalization belongs in core.
Documentation remains ordinary Markdown under `docs/`. `src/feature.ts` declares
`documents: new URL("../docs/", import.meta.url)`; compilation scans recursively.
IDs are case-preserving relative paths including the extension: `docs/setup/smtp.md`
becomes `setup/smtp.md`. Titles come from exactly one H1 per file. Capabilities reference
these IDs in `docs: [...]`; internal links resolve relative to the document. Moving a
file changes its ID and requires updating references and links.

The source directory must exist. Discovery rejects symlinks, invalid document paths,
invalid UTF-8, missing headings, broken links and dangling capability references.
Only `.md` files are included; other regular files are ignored. Limits are 64 documents,
128 KiB each, 4 MiB total, 1,024 visited entries and eight nested directory levels.
The SDK root does no filesystem IO; compilation snapshots exact bytes synchronously
before asynchronous hashing. Bootstrap also emits `ulvia-sdk-runtime/v1` metadata from the same compilation.
`infra/bootstrap.ts` stages it at the surface's
`src/capabilities/features/generated/runtime.json`. Runtime mounting verifies that
artifact and attaches executors without source asset discovery or Zod conversion.
See [SDK runtime artifacts](sdk-runtime.md) for the format, trust boundary and guards.

Migrated feature definitions have no `contracts/` directory or public `./contracts`
entry. `src/feature.ts` declares identity, version, parent and the capability list.
Capability descriptors own IDs, access, behavior and HTTP/MCP bindings. Optional
deprecation and response effects retain ordinary admission rules. The Provider
selects implementations and enforces mounting/authentication policy.

Named mocks are explicit capability data, optionally imported from `src/mocks/`;
no directory scan or repeated owner ID is needed. Multiple scenarios may share
input. TypeScript inference and build admission validate their payloads and codes;
local mock IDs must be unique. Binary fixtures retain their verified asset references.

These changes preserve existing contract versions, canonical bytes and digests.
Emailer/SMTP, Secrets and Files capabilities own
`execute({ input, services, context, fail })`. `src/capabilities/define.ts` types
capabilities once with `capabilitiesFor<Services>()`, which returns `defineCapability`.
`src/feature.ts` calls the SDK's `defineFeature` directly. It is the single source
for identity, version, parent, capabilities and documentation. Build generates the
contract projection. Required services are inferred from own/inherited capabilities;
inputs, outputs and failures
are inferred from capability schemas. SMTP services satisfy the parent Emailer port,
so the send executor is inherited. Short executors stay beside their declarations;
larger treatments can be ordinary functions referenced by `execute` or core services.
There is no feature-owned handler registry or mandatory `handlers/` directory.

The surface selects the complete defaults with `implementFeature` and retains secret
capability requirements and official error presentation. Its single inventory is
`packages/surfaces/ulvia-provider/src/capabilities/features/inventory.ts`.
`compileOfficialFeatures` compiles it for release preparation and bootstrap.
`loadOfficialFeatures` verifies the emitted artifact and attaches matching runtime code. The manifest
claims and generated current execution support matrix follow that inventory.
`registerOfficialProviderCapabilities` receives exact profile release pins rather than
contract IDs alone; `registerOfficialFeatures` mounts the selected SDK families.
Unsupported versions/digests reject before service projection or registration.
Missing services refuse a claimed implementation; disabled features mount nothing.
Adding the next migrated feature requires its implementation entry and injected
service ports, without a family-specific registrar or separate compilation cache. Other implementations may
use `implementContract` with complete coverage. Service projections select ports from
runtime dependencies for features with different service contexts; they run only at
mounting. Missing default executors reject feature implementation, while contract-only
definitions remain compilable. Contracts and build artifacts never serialize executors.

Public Zod schemas retain v1 constraints and digest parity. Derived internal schemas
own text/password normalization and enabled SMTP configuration checks. State checks
still run after retaining the existing password. Handlers no longer carry repeated
manual field checks. `executeCapability` from `@bernouy/ulvia-sdk/local` validates
local synchronous JSON calls using Zod; streaming/operation modes use the Provider.
Provider calls retain admitted Ulvia validation; the bridge does not parse JSON again.

Declared failures carry safe payloads and optional private causes. The surface's
`formatCapabilityFailure` hook retains official translations and language headers;
actual admitted bindings select statuses. Causes, passwords and mail bodies never
become receipt payloads. A new send still uses one port call, one receipt insert and
one update; replay uses one duplicate insert and one lookup. Error presentation
adds one host callback and payload validation for declared failures, without IO.
Adding domain folders does not change capability identities or release versions.

The SDK authoring API uses capability terminology consistently. The protocol's
`execution: "operation"` and `operationId` retain their long-running meaning.
No published contract, Provider manifest, HTTP route, version or digest changes
merely because the source vocabulary changes.

## Files execution

Files contributes its complete 27-capability implementation through the same surface
inventory. Schemas, HTTP/MCP bindings, default executors and the two Markdown documents
live in `@bernouy/files`; the manifest retains the same Secrets requirements.
The runtime injects `FilesService` and a `CmsFileWorkspace` port. Workspace credentials
and concrete blob/metadata/secret stores stay in the runtime. Mounting a selected Files
release without either port refuses, rather than advertising a partial implementation.

Uploads borrow `context.binaryBody.stream`. Downloads return a streaming `Response`
with the immutable generation's content type, length, ETag, cache policy, disposition,
Range and If-Range metadata. The SDK enforces admitted binary bounds and propagates
cancellation; it does not collect a complete file in memory. Namespace credentials,
quotas and ownership checks remain in Files. No Files capability uses keyed receipts,
so this migration adds no durable execution policy or pre-receipt authorization hook.

## Feature-owned error classification

Emailer/SMTP, Secrets and Files declare a synchronous `mapError` policy in their
feature source. Default capability bodies call their injected services directly;
they no longer wrap every call in a domain-specific error helper. The SDK applies
the declaring feature's policy to executor and guard exceptions, checks the mapped
code/payload, and preserves the original cause privately for surface localization.
Explicit capability failures retain their owner and bypass classification.

The Provider derives HTTP status from the admitted binding and formats official
messages/headers. A mapped authorization refusal is presented before durable receipt
access. Default service methods retain their own domain authorization checks.
Inherited Emailer send failures use the Emailer policy; SMTP configuration failures
use SMTP's own policy. Alternative implementations retain their own error handling.
For local JSON calls with feature policy, use `executeCapability(feature, id, call)`.

## Observability execution

The same inventory selects all four diagnostic capabilities from
`@bernouy/observability/feature`. Entry/detail/summary/query/group DTOs derive
from reusable Zod schemas. Ingestion retains its trusted machine-context guard;
HTTP/MCP read access and the original contract/document bytes stay unchanged.
The runtime injects an instance-bound journal service through a structural port.

Signed HTTP tests cover producer-header forgery, foreign instances, redaction,
duplicate/conflicting entry IDs, all read operations and invalid continuations.
A limit-one page performs one store query and loads at most two rows; three
successive pages over three records load five rows in three queries. Foreign or
changed cursors refuse before any store query. The migration adds no journal
queries, persistence cache or durable command receipts.
