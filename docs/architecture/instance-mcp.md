# Instance MCP V1

## Ownership and connection

The CMS Edge mounts MCP at `/.cms/mcp`, including for the Repository application.
Registry capabilities are HTTP-only; there is no root `/mcp` route. The Edge
resolves the instance's selected exact contracts and invokes their Provider
implementations through the Gateway and HTTP. Remote selected capabilities exposed through MCP must also declare an
HTTP binding. Tool arguments cannot supply a site identity or trusted actor.

The current SDK-generated catalogue exposes 82 tools: 28 Content capabilities, seven
Files workspace capabilities, 29 installation/operation, initialization, documentation
and discovery capabilities, 15 Repository connection/resource authoring capabilities
and three administrator observability reads (`logs.query`, `logs.get`,
`logs.aggregate`). Account administration,
Provider control, Secrets, Emailer, global file namespaces, log ingestion and
internal delivery operations are HTTP-only. MCP bindings have specific
descriptions and behavior annotations; the admitted schemas still govern
inputs, outputs and declared errors.

Connect a compatible OAuth client to `https://<instance>/.cms/mcp`. Discovery
uses `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server`. Client registration, consent and
token exchange use `/.cms/oauth/register`, `/.cms/oauth/authorize` and
`/.cms/oauth/token`. Redirect URIs are exact, PKCE uses S256 and tokens are
bound to this instance's MCP resource. Public HTTP is restricted to loopback (including named `.localhost` instances)
in the reference authorization implementation; production uses HTTPS.

Consent uses existing CMS credentials and session effects through the selected
Access contract. V1 requires a current administrator and grants `cms:full` /
`full_access` for the exposed tools. Authorization is rechecked on every use.
Access tokens last 15 minutes; rotating refresh credentials and connections
expire after 30 days. Reuse of a retained refresh credential revokes its grant.
The owner can inspect and revoke connections at `/.cms/connections`.
Public registration and consent preparation each allow 32 attempts per minute
through an instance-owned durable rate limiter. Unapproved clients expire after
10 minutes; preparation renews that short window. Only administrator consent
extends client retention to a year. Expired provisional records are removed;
there is no lifetime registration count that anonymous clients can exhaust.
Connection lists use bounded cursor pagination, including revoked entries.
Mongo persists clients, consent state and grants through the Provider runtime.
The Edge has no separate account or token database.

This is OAuth delegation, not an OIDC login provider. A future OIDC credential
provider can reuse account subjects and policy seams, but discovery and ID-token
validation for that provider are not implemented here. Roles and narrower
connection scopes are also future work.

## Collection workflow

`ulvia/cms.authoring` exposes `get-connection`, `configure-connection`,
`disconnect-connection`, `claim-namespace`, `list-namespaces`, `prepare-collection`,
`publish-collection`, `get-collection-sources` and `discard-preparation`.
It also exposes `prepare-contract`, `publish-contract`, `get-contract-sources`,
`prepare-provider-manifest`, `publish-provider-manifest` and
`get-provider-manifest-sources`. These use the same connection and reviewed
preparation/publication boundary. See the contract-source and Provider-source
guides in the selected Authoring release for their exact source formats.
The Provider stores an ordinary Repository account PAT in the contract's encrypted
secret namespace, pinned to the configured Repository origin and identity. Tools
never return that saved secret. The publishing account remains separate from the
CMS administrator authorizing the authoring call.

1. Configure the Repository connection with an account PAT, inspect its status,
   then list or claim a namespace belonging to that account.
2. Submit a complete snapshot to `prepare-collection` as `sourceJson`:
   `{ "files": [{ "path": "definition.json", "content": "..." }] }`.
   Paths follow the same authored collection conventions as CLI `release`.
   Optional binary asset references identify an exact site file generation or
   an immutable Repository collection asset; arbitrary download URLs are rejected.
3. Inspect `valid`, `diagnostics`, source/release digests and browser-risk output.
   Compilation failures produce bounded diagnostics. The compiler uses the shared
   `@bernouy/repository/collections/build` API, also used directly by the CLI.
4. Publish the exact `preparationId` and `expectedDigest`. The host recompiles
   and compares the preparation before account-authorized publication. Publication stores the immutable
   release, then its private source snapshot. A retry can finish snapshot storage
   after a partial publication. Installation is a separate action.
5. Use collection installation tools to install or upgrade the reviewed release,
   with the current installation revision and any required browser-risk approval.
   Installed Blocs become available to Content tools. Page edits remain CMS data.
6. Retrieve private sources by exact coordinate to prepare a later version.
   Source reads require the connected account's current namespace ownership too.

Preparations are temporary local directories, not persistent editing workspaces.
They expire after seven days and are capped at 64. Source JSON is limited to
1 MiB, 2,048 text files, 512 KiB per text file and 64 binary references.
Resolved binary bytes are bounded to 16 MiB each and 64 MiB total. Path traversal,
symlinks, hidden files and duplicate/overlapping paths are rejected.
The official Provider runs Bun with `--no-macros`; startup refuses to run without
this flag. Admission and import restrictions do not constitute an OS sandbox.
No client-supplied build scripts or test commands are executed.

## Namespace inventory

`list-namespaces` queries the connected account's current Repository inventory,
which is bounded to 32 namespaces. Its `cursor` / `limit` projection and optional
exact namespace filter return `owned` or `suspended`, revision and check time.
Namespaces claimed through the CLI or another connected CMS appear automatically
when those clients use the same Repository account. Transferred namespaces leave
the previous owner's inventory. No local tracking database or tracking command
is required.

Each request verifies the pinned Repository identity before resolving the PAT.
An unavailable Repository produces an error rather than stale ownership. Every
publication and private source request checks current ownership and revision;
the inventory itself does not authorize writes. Disconnecting removes the local
connection; revoking its PAT is a separate shared Access account operation.

## Files and context

Authenticated MCP initialization returns short English server instructions and,
when available in the selected Installations release, an exact reference and
reading-tool call for the "Working with Ulvia" guide. This uses the existing
documentation tools; it does not add a tool per guide. The guide introduces
concepts, goal-based searches, cross-contract workflows and verification.

The instance Files workspace supports listing, upload creation/completion,
delete and signed downloads. `workspace.upload.create` returns an `uploadUrl`:
PUT raw bytes there using the MCP Bearer credential and `Upload-Token`, then
call `workspace.upload.complete`. The bridge rechecks the connection and invokes
the selected Files HTTP capability with a trusted actor. Credentials are never
embedded in the URL or forwarded as arbitrary Provider bearer credentials.

Four read-only MCP resources provide current context:
`ulvia://cms/collection-authoring`, `ulvia://cms/installed-collections` and
`ulvia://cms/site-files` and `ulvia://cms/repository-namespaces`. The installed collection and namespace resources are dynamic; follow the tool
cursors to read later pages.
The two Markdown guides now come from the selected contract releases, through
`documentation.get`. Tools retain normal discovery and link exact documents in
metadata. See [contract documentation](contract-documentation.md) for hybrid
search, authoring and model operation.

Prompts, packaged skills, persistent source workspaces, previews and a generic
asset/context manifest are deferred. Contract and Provider source preparation
and publication are available through both CLI and instance Authoring capabilities.

## Versions and verification

New system installations use Provider manifest and Installations `1.3.0`, Content
`1.0.1` and Authoring `1.1.0`. Registry `1.1.0` is installed explicitly through
native setup. Other system contracts retain their existing versions. Named
profiles are removed. Existing sites keep their admitted pins and use explicitly
verified retained SDK execution; source edits do not publish or deploy releases.

Normal `bun run verify` includes domain, HTTP protocol and source-pipeline
regressions. The opt-in real-image journey uses isolated local Docker containers
for MongoDB, Provider and independent CMS/Repository Edges, plus Chromium. The harness lives in
[`tests/integration/instance`](../../tests/integration/instance/README.md).
Its scenarios cover consent, publication, installation, rendering, file bytes,
Provider connections, log isolation, account ownership, persistence and revocation.
The current generic discovery adapter lists 82 tools from the generated artifact
(in two pages). Some opt-in integration assertions still expect the earlier 68-tool
snapshot; they require reconciliation before claiming a complete current-image pass.
With matching local images already built, run:

```sh
ULVIA_MCP_EDGE_DOCKER_IMAGE=docker.io/cyaxis/ulvia-edge:<tag> \
ULVIA_MCP_PROVIDER_DOCKER_IMAGE=docker.io/cyaxis/ulvia-provider:<tag> \
bun test ./tests/integration/instance ./tests/images/repository
```

The journey never uses the public Repository. It removes its own containers,
volumes and network. The CLI Edge smoke journey is a separate check with its own explicit test
collection.
