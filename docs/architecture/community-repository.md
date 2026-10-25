# Community Repository

## Implemented ownership and deployment

`@bernouy/cms-repository` owns immutable collection, contract and provider-manifest
artifacts, namespace authority, revisioned publication metadata and publication
ports. `publisherId` is the ownership namespace; artifact coordinates remain
`(kind, publisherId, id, version)`. Collection runtime namespaces and resource IDs
retain their existing admission rules. Site installations and overrides remain
CMS-owned state and never become mutable Repository artifacts.

Namespaces are publicly claimed by the first valid Ed25519 possession proof.
The filesystem adapter serializes competing claims across local processes.
`ulvia` and `ulvia.*`, and publishers already present in a legacy repository,
are reserved. The operator HMAC credential can write those reserved publishers;
it cannot write, rotate, recover or revoke a community namespace.

Each namespace has one active public key. Rotation requires signatures by the
current and replacement keys at the same expected revision. Revocation is
terminal. Lost private keys cannot be recovered by the operator. Retain secure
backups before claiming a namespace or rotating its key.

The server stores canonical Ed25519 SPKI public keys, never private keys. Proofs
bind the persistent Repository identity, namespace, key revision, action,
subject, SHA-256 content digest, timestamp and nonce. The clock window is five
minutes. Legacy HTTP owner requests also use durable replay claims. Contract
commands use natural idempotency, exact subject/content bindings and revision
fences; an exact retry reconciles an existing result rather than granting a
second mutation. TLS protects signatures against interception.

Namespace history consists of immutable committed revision records linked by
their previous digest. A single atomically replaced current record controls
visibility. Unreferenced revisions left before a failed pointer update are
invisible and replaceable under the lock. History reads request one exact
revision. Namespace locks fence the entire authorized operation against key
rotation and revocation, including during a streamed upload or registry commit.

Publication retains the existing bounded signed manifest, separately streamed
assets and idempotent commit receipt. Artifact metadata becomes visible after
verified immutable asset bytes. A failure after artifact publication but before
the receipt is persisted can be retried against that same immutable artifact.
Yank and restore mutate catalogue metadata, not release bytes. Owner mutations
carry an expected publication revision; stale changes fail and exact retries
return the existing state.

`@bernouy/official-repository-server` remains the compatible runtime/package name
and `docker.io/cyaxis/ulvia-official-repository` remains the image repository.
The image can serve an empty community volume or the existing official seed.
Build/publish tooling remains in `infra/images/build.ts`, outside the installed
CLI. No image is implicitly built or published by a lifecycle command.

```sh
ulvia repository start community --version 0.1.0 --port 5010
ulvia repository status community
ulvia repository upgrade community --version 0.1.1
ulvia repository stop community
```

The versions above are illustrative; choose an image tag actually published by
the operator. Each named deployment has its own volume, operator credential,
Compose project and pinned image digest under `$ULVIA_DATA_DIR/repositories/`.
The command starts only a Repository. It binds the endpoint to loopback; public
TLS ingress is independently configured by the deployment operator. Existing
shared-service and Kernel lifecycle commands retain their separate behavior.
Production supports one active server on one local volume with atomic rename,
exclusive-create and hard-link semantics. This is not a multi-host database.
The executable runtime holds a kernel `flock` on `.server-lock` for its lifetime
and rejects a competing server. A child holds the lock while the server owns
its input pipe; graceful shutdown or a crash releases it without PID checks or
a stale interval. Loss of that child stops the listener. The local filesystem
must support `flock`, and the runtime must provide the `flock` executable.

## Contract and transport clients

`@bernouy/cms-repository/repository/contract` exports `admitRepositoryContract`
and `RepositoryCapabilityService`. The exact admitted `ulvia.repository@0.1.0`
definition is available at `GET /v1/repository-contract`; its ETag is its release
digest. This built-in protocol definition is not automatically published into
the user's mutable catalogue. Consumers explicitly admit and pin it.

Its capabilities describe Repository identity, namespace lookup/claim/rotation/
revocation, paginated catalogue reads, binary release downloads, staged upload
creation/status/asset/commit/abort, publication metadata reads and revisioned
yanks. Errors are declared as `REJECTED` and `NOT_FOUND`. All capabilities have
public transport access: ownership-sensitive operations verify their exact
cryptographic proof in the domain service, independently of CMS login methods.
Transport access does not grant namespace authority.

Admitted namespace mutations use `POST /v1/namespace-actions/claim`,
`POST /v1/namespace-actions/rotate` and `POST /v1/namespace-actions/revoke`.
The public client retains `POST /v1/namespaces/:namespace`;
legal namespace names such as `claim`, `rotate` and `revoke` remain available.
Technical failures propagate to the Gateway: a dispatched command with an
uncertain result returns `outcome_unknown` and records `outcome-unknown` in
the command audit, rather than claiming a declared domain refusal.

The runtime pins an explicit process-local contract/manifest/installation and
dispatches through `CapabilityGateway`, including normal schema, behavior,
response and command-audit rules. It exposes the admitted HTTP paths directly
and through `/.cms/call/ulvia.repository`. It does not invent a second MCP
execution engine. This local installation is runtime wiring, not a persisted
CMS site selection or proof that a remote deployment passed conformance.

Current CMS read-only sources continue to use their HTTP catalogue adapters.
The Provider runtime accepts `CMS_REPOSITORY_URL` and its existing explicit
insecure-development setting. The Kernel receives selected capabilities and
does not choose Repository credentials. A host can use `RemoteRepositoryClient`
with a `RepositoryOwnerCredential` to publish; its `resolvePrivateKey` callback
resolves the key through an injected `SecretReader` or isolated CMS Secrets
namespace. Persist secret references and public ownership metadata only. Resolve
private material immediately before signing; do not send it to the Repository,
browser, agent tool arguments or logs. The CLI reads a private regular key file
with no symlink following, a 4096-byte bound and owner-only permissions.

```sh
ulvia namespace keygen --key-file /private/community.pem
export ULVIA_REPOSITORY_PRIVATE_KEY_FILE=/private/community.pem
ulvia namespace claim community --repository https://repository.example
ulvia push contract community/community.example@1.0.0 --repository https://repository.example
ulvia namespace status community --repository https://repository.example
```

Generate a separate replacement file and use `namespace rotate` with
`--replacement-key-file`, then select the replacement file for later writes.
`namespace revoke` requires `--yes`. Keep authoring and signing environments
separate when an agent should not possess publication authority.

## Explicit capability bindings

New declarations use a nonempty `bindings` array, with at most 16 entries and
unique IDs within each capability. Supported variants are `http` and `mcp`.
HTTP bindings retain method, path, input mappings and response rules; MCP
bindings optionally declare `tool.name`, `tool.title` and `tool.description`.
Multiple HTTP aliases or MCP tools may expose the same domain operation.
Overlapping HTTP routes and duplicate declared MCP names fail admission.
WebSocket, skills, prompts and resource catalogues are not implemented.

A capability may declare only MCP bindings. Its admission then contains no HTTP
execution plans, and both direct and logical HTTP entry points reject it.
Gateway invocation validates the selected capability's input, output, errors,
access, retry identity and command audit without requiring HTTP status or a
compiled HTTP binding. The selected exposure ID and protocol are rechecked
against the exact selected release before dispatch.

HTTP route resolution, automatic binary HEAD, wire content types, response
statuses and headers belong to the HTTP adapter. A host's native transport
returns domain outcomes directly. An outbound HTTP transport uses the requested
HTTP binding when one is selected; otherwise it chooses the first declared HTTP
binding. It fails before network access when none exists. Optional HTTP response
metadata is carried through the Gateway without becoming a domain prerequisite.

Historical `binding` declarations remain accepted as HTTP-only. Their canonical
JSON and digests are preserved, rather than silently rewritten. Authoring both
`binding` and `bindings` is rejected. Removing or renaming an MCP exposure
requires a major release; descriptive tool metadata can evolve in a patch.

## Reusable MCP binding

`@bernouy/cms-gateway/mcp` exports `CapabilityMcpBinding` and
`createCapabilityMcpHttpHandler`. Inject exact admitted releases, a normal
Gateway invoker and trusted per-request actor/site context. Only capabilities
with an explicit `transport: "mcp"` binding are discoverable and callable.
HTTP-only and historical single-binding capabilities are never implicitly
exposed. No Repository identifiers are hard-coded in this adapter. Tool names
use the binding's configured name or a deterministic contract/capability/binding
identity; metadata includes the binding ID and exact release digest.
Discovery is deterministic and paginated at 64 tools, with 1024 tools maximum.

The supported HTTP protocol is explicitly `2025-11-25`, using JSON responses,
no protocol sessions, and no server-initiated streams. It supports initialization,
ping, tool discovery and calls. It rejects unapproved browser Origins and
unsupported protocol versions. The Repository mounts it at `/mcp` for public
discovery and domain-proof-authorized commands. Host authentication belongs in
the injected context resolver; model-supplied arguments cannot choose an actor.

Inputs use `{ input, idempotencyKey? }`; keyed commands require the explicit
retry key. Outputs use `{ output }`, and declared errors use
`{ error: { code, retryable, output? } }` with MCP `isError`. JSON Schema is a
discovery projection; Gateway validation enforces the Ulvia schema dialect,
including UTF-16 string lengths. Operation handles remain Ulvia operation
handles, not MCP Tasks. Admission rejects MCP bindings on capabilities with
browser session effects; discovery also excludes them defensively.

Binary results become resource links through a host-provided publisher.
Binary inputs use a host-authorized resource URI resolver, never arbitrary URL
fetching or whole-bundle base64. New authored assets can be streamed over the
declared HTTP upload binding between MCP begin and commit. Resource delivery
policy, retention and authorization belong to the host.
Tools requiring a binary input resolver or output publisher are omitted when
the host has not supplied that port. The Repository supplies public immutable
release links; its asset-write tool remains available through raw HTTP.
Set the runtime's `REPOSITORY_PUBLIC_URL` to the external HTTPS origin behind
a proxy. The default is loopback HTTP at the configured listen port; resource
links never derive their authority from request or forwarded headers.

The newer `2026-07-28` protocol changes initialization/metadata, headers and
results. It requires a separately tested profile; this implementation does not
advertise support for it. See the primary specifications for
[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
and [HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Limits and next work

The contract bounds manifest strings to 1 MiB, JSON envelopes to the existing
8 MiB Gateway budget, and raw assets to 100 MiB. The legacy transfer protocol
retains its existing larger manifest envelope. Public catalogue pages contain
at most 256 entries; exact artifact reads survive yanking.

Public first-claim naming needs deployment-specific rate limits, storage quotas,
abuse handling and reserved-name policy before unrestricted Internet exposure.
The reference adapter rebuilds full in-memory catalogue indexes and retains
commit receipts and audit records. Storage growth, retention and large-catalogue
indexes need production capacity policy; bounded response pages are not a claim
of constant work over an unlimited repository.

Remote installation/observation of the Repository as an ordinary selectable
Provider, CMS administration Pages for namespace keys, multiple delegated keys,
source workspaces, source snapshots, and a distributed storage adapter are not
implemented. They must preserve the same contract, ownership and secret ports.
The proposed authoring/test roadmap is in [agent authoring](../development/agent-authoring.md).
