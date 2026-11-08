# Community Repository

## CMS instance composition

A Repository is an explicitly enabled `ulvia/repository` CMS application profile.
Its Edge exposes the website and admitted API; the official Provider implements
Repository operations and owns persistence. Edge, Provider and MongoDB remain
independent processes. Ordinary CMS profiles do not expose Registry capabilities.

`packages/official-repository/contracts/repository` contains the authored
registry contract. Domain implementation and validation belong to
`@bernouy/repository`; the Provider runtime chooses its adapters. Authored
resources neither mount routes nor connect to databases.

The Provider image bundles the exact admitted artifacts required by its profiles.
A local source supplies those artifacts through the normal provisioning flow,
without a remote Repository. Missing or invalid bundled artifacts fail explicitly.
Restart preserves instance identity, credentials, namespace ownership and edited
Pages. The public catalogue is separate from this technical bootstrap: publishing
resources into it remains an explicit authenticated action.

```sh
ulvia services start
ulvia instance create registry --profile repository@1.0.0
ulvia instance status registry
ulvia instance stop registry
ulvia instance start registry
```

The CLI discovers supported exact profiles through the protected Provider
operator endpoint and persists the selected reference. Profile upgrades use
`ulvia instance upgrade-profile registry ID@VERSION` within the same application
ID. Provider and Edge image upgrades use the normal `ulvia upgrade` commands.
The installed image pins and database/files credentials persist across restarts.
There is no separate Repository runtime, image, Compose service or signing-key
compatibility protocol. See the [installation guide](../installation/README.md#9-repository-cms-instance).

## Authentication and ownership

Repository accounts belong to this CMS instance. Access supplies registration,
login, sessions and own-PAT creation/listing/revocation. PAT verification and
Gateway actor resolution are shared with other CMS capabilities. An ordinary
registered account can claim and publish without becoming an administrator.
PATs inherit account permissions; additional PAT scopes are not implemented.

Namespaces reference stable account IDs and have a revision and active/suspended
state. Claims are atomic, ownership is checked server-side, and an account may
own at most 32 namespaces. Transfer requires the current owner, expected revision
and an existing target account. Suspension does not release the name. Account
deletion is refused while it owns namespaces, under the same ownership fence;
refusals leave account credentials and publications unchanged. Startup never
claims or reassigns names, including `ulvia`.

Uploads bind the account, namespace and ownership revision. Every protected stage
checks the verified actor and ownership. Transferred namespaces cannot finalize
an upload opened by the previous owner; revoked PATs fail subsequent protected
requests. Private source snapshots require the same account ownership. Public
namespace metadata does not expose internal account identifiers.

Publication preserves bounded metadata and streamed assets, SHA-256 verification,
admission, evolution rules, immutable coordinates, retry receipts and artifact-last
visibility. Yank/restore changes catalogue metadata rather than immutable bytes.
The filesystem adapters retain their atomic-write and recovery responsibilities;
Mongo stores instance-scoped account ownership. This is a single-replica design,
not distributed storage.

## Contract and clients

`ulvia/repository@2.0.0` declares the registry's public and authenticated
capabilities. Edge mounts selected bindings below `/.cms/call/ulvia/repository`.
Protected operations use `access: "authenticated"` and domain ownership checks.
Installing a contract definition alone does not load an implementation.
The old root `/v1` endpoints and namespace proof headers are not accepted.

`ulvia/cms.authoring@1.0.0` prepares, validates and publishes collections from a
CMS to its configured Repository. The rename does not add contract or Provider
manifest authoring. The CLI can release and publish all three resource kinds.
CMS publishing stores a shared PAT in the authoring contract's encrypted secret
namespace. Its connection is pinned to the configured origin and Repository ID;
configuration returns status only and never the token.

```sh
# Supply a PAT through ULVIA_REPOSITORY_TOKEN or bounded stdin.
ulvia repository login https://repository.example --token-stdin
ulvia namespace claim community
ulvia push contract community/community.example@1.0.0
ulvia namespace status community
ulvia repository logout
```

Clients share `RepositoryConnection` and `RemoteRepositoryClient`. Each protected
request verifies the public Repository identity before resolving the token,
refuses redirects, and bounds response size and duration. CLI credentials use a
private `ulvia.client.v1` configuration. Logout/replacement invalidates live
credential resolvers. Logout does not revoke the remote PAT.

## Explicit capability bindings

New declarations use a nonempty `bindings` array, with at most 16 entries and
unique IDs within each capability. Supported variants are `http` and `mcp`.
HTTP bindings retain method, path, input mappings and response rules; MCP
bindings optionally declare `tool.name`, `tool.title` and `tool.description`.
Multiple HTTP aliases or MCP tools may expose the same domain operation.
Overlapping HTTP routes and duplicate declared MCP names fail admission.
WebSocket, skills and prompts are not implemented. The CMS host supplies four
MCP resources; see [Instance MCP V1](instance-mcp.md).

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
binding. It fails before network access when none exists. Remote HTTP installation
selection additionally rejects MCP exposures without an HTTP binding. Optional HTTP response
metadata is carried through the Gateway without becoming a domain prerequisite.

The fresh v1 grammar requires `bindings`; the retired single `binding` field
is rejected. Readers do not reinterpret the removed development shape. Removing or renaming an MCP exposure
requires a major release; descriptive tool metadata can evolve in a patch.

## Reusable MCP binding

`@bernouy/cms-gateway/mcp` exports `CapabilityMcpBinding` and
`createCapabilityMcpHttpHandler`. Inject exact admitted releases, a normal
Gateway invoker and trusted per-request actor/site context. Only capabilities
with an explicit `transport: "mcp"` binding are discoverable and callable.
HTTP-only capabilities are never implicitly exposed. No Repository identifiers are hard-coded in this adapter. Tool names
use the binding's configured name or a deterministic contract/capability/binding
identity; metadata includes the binding ID and exact release digest.
Discovery is deterministic and paginated at 64 tools, with 1024 tools maximum.

The supported HTTP protocol is explicitly `2025-11-25`, using JSON responses,
no protocol sessions, and no server-initiated streams. It supports initialization,
ping, tool discovery and calls. It rejects unapproved browser Origins and
unsupported protocol versions. Only the CMS instance mounts MCP, at `/.cms/mcp`,
with OAuth consent and trusted context resolution. Registry capabilities are
HTTP-only; a Repository CMS instance retains its standard administrator MCP
endpoint, without Repository-specific tools. Model-supplied arguments cannot
choose an actor.

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
the host has not supplied that port. The CMS V1 file workspace uses a separate
authenticated binary upload bridge. Repository publication streams digest-verified
asset bytes through its PAT-authenticated HTTP API; no Repository MCP asset-write
tool is exposed.

The newer `2026-07-28` protocol changes initialization/metadata, headers and
results. It requires a separately tested profile; this implementation does not
advertise support for it. See the primary specifications for
[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
and [HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Limits and next work

Publication metadata uses a raw binary envelope bounded to 20 MiB, canonical
releases remain bounded to 8 MiB, and raw assets to 100 MiB. Other JSON
envelopes retain the existing 8 MiB Gateway budget. Public catalogue pages contain
at most 256 entries; exact artifact reads survive yanking.

Public first-claim naming needs deployment-specific rate limits, storage quotas,
abuse handling and namespace naming policy before unrestricted Internet exposure.
The reference adapter rebuilds full in-memory catalogue indexes and retains
commit receipts and audit records. Storage growth, retention and large-catalogue
indexes need production capacity policy; bounded response pages are not a claim
of constant work over an unlimited repository.

The Repository profile installs the `ulvia/repository` collection alongside
`ulvia/mossa`. It copies examples once into ordinary Content Pages: `/` for
the public catalogue, `/search`, `/resource`, `/signup`, `/login`, `/account`,
`/account/namespaces`, `/account/publications` and `/account/tokens`. Pages reuse
shared Access cookies, typed queries and mutations; publishing uses the CLI or
a connected CMS. The personal token Page supports optional expiration and shows
a new token secret only in the creation result. Public release downloads retain
their existing API/CLI flow. Namespace/account Pages are not indexed. Collection
upgrades do not turn those site-owned Pages into managed immutable templates.
Federation, teams, SSO, additional PAT scopes and multi-replica storage are outside
this work.
Private immutable source snapshots use authenticated bindings below
`/.cms/call/ulvia/repository/v1/source-snapshots`. Writes must match an existing
collection release digest. They remain separate from public downloads.
The proposed authoring/test roadmap is in [agent authoring](../development/agent-authoring.md).

## Resource discovery before installation

`QUERY /.cms/call/ulvia/repository/v1/search` is the public `catalogue-search` capability. It searches collection, listed Bloc, contract and Provider manifest metadata. `@bernouy/repository/repository/search` owns ranking orchestration and CMS-side federation; `/repository/search/filesystem` and `/repository/search/http` are explicit adapters. Public exact-release GETs remain the source for inspection and survive yanking.

The Provider host shares its `@bernouy/text-embeddings` multilingual model across
documentation and enabled Registry instances. Its image ships verified files in
`/opt/ulvia/models` and sets `ULVIA_EMBEDDING_MODEL_DIR` for strictly local loading.
Native development without that variable uses the Provider's writable
`.documentation-models` cache. See [model packaging](../../infra/models/README.md).
Search does not wait for corpus preparation; unavailable semantic results report
lexical fallback. The host disposes instance indexes and the shared model during
shutdown. Registry indexes share one bounded derived-vector cache per Provider host. It
retains at most 8,192 entries, each with at most 4,096 finite coordinates and a
128-character key. Keys bind the exact model identity and passage content;
scoped results and corpus revisions remain instance-owned. Closing an instance
keeps reusable public vectors; closing the host clears them. Documentation
vectors retain their existing instance-scoped Mongo storage.

The derived search corpus selects latest non-yanked releases before reading their search metadata and embedding them. This same business corpus is used for preparation and queries; historical exact reads remain available. Identical model/content pairs are embedded once per preparation, including on a cold cache. The search corpus is bounded to 4,096 selected releases, 16,384 rows and 32 MiB of serialized row text. Passage embeddings use the first 4,096 UTF-16 units of each row, while bounded lexical text retains capability identifiers. The index uses exact vector comparisons within this bounded corpus rather than a separate vector database. Eight searches are admitted concurrently per Repository. Metadata indexes rebuild once per changed snapshot and reuse unchanged snapshots after catalogue refresh. Existing filesystem catalogue enumeration still precedes the search release budget; this is not a constant-cost index over unlimited storage.

CMS `ulvia/cms.installations/repository.search` exposes up to fifty candidates per configured source, at most eight sources, with four outgoing requests concurrently. Per-source ranks are fused, identical releases are deduplicated, latest discovered versions are grouped, and same-version digest conflicts retain their source identity. Continuation cursors bind to the query and candidate snapshots. Partial sources and lexical fallback are explicit.

`repository.get` verifies a public exact release and returns bounded JSON continuations, optionally selecting a Bloc or example. It never installs resources or executes code. One CMS discovery service admits eight searches/reads concurrently and retains at most eight verified projections, 16 MiB total, with at most eight pending loads. Keys include source, complete immutable reference and resource selector; failed loads are discarded. Authorization belongs to the normal administrator capability path. Selected-contract documentation search and its instance revision checks remain separate.

Run `bun run packages/features/repository/tests/repository-search/evaluation.ts <cached-model-directory>` for an offline lexical/hybrid relevance sample. It measures a small synthetic corpus, not production retrieval quality.

Discovery uses typed domain failures across adapters: invalid input (422), absent exact resource (404), release mismatch or expired cursor (409), corpus/response budgets (422), and infrastructure unavailability (503). Remote error bodies are bounded to 4 KiB and 100 ms, interpreted only for known codes, and never forwarded as diagnostic text. Search may report failed sources as partial results; a 404 during an exact read remains `NOT_FOUND`.

## Authoring Publication Evidence And Recovery

Collection preparation asks the configured Repository to check publication
history through `publication-check-collection`. The authenticated query holds the
namespace ownership fence and Repository write lock and inspects only the
candidate collection, including yanked releases. It reads at most 256 directory entries and 64 historical
metadata documents (plus one exact-coordinate probe), retains at most 32 MiB of
history, and never hydrates asset bytes. CMS authoring caps candidate metadata at 1 MiB of UTF-8; the native query
string schema allows 1,048,576 UTF-16 code units. Missing service or excess evidence returns explicit
incomplete preflight; the final registry publication remains authoritative.

Evolution errors retain known publication codes across Repository and Provider
boundaries. Remote technical messages are not forwarded; clients reconstruct
known safe guidance from the declared code and bounded resource identity.

Preparations bind their canonical release and retained sources to checked
hashes, a Repository origin/identity and a seven-day expiry. Successful release
publication writes an atomic, synced local receipt before private source
retention. A retry with a receipt completes the sources without rebuilding or
re-uploading; loss of the commit response instead reports an unknown outcome
and exact replay uses the Repository's existing idempotent commit. Current
namespace authority is rechecked on every retry. Preparations are scoped to an
instance; missing or expired preparations never receive an implicit repair.

For a configured connection, preparation adds four bounded HTTP reads: two
Repository identity probes, one owned-namespace inventory and one preflight
query. Previously preparation made no Repository request. No asset bytes are
downloaded for history. A source-completion retry with a retained receipt uses
namespace authorization and the source write, and opens no publication upload.
