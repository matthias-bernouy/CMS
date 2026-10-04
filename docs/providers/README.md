# Repository And Gateway Flows

`@bernouy/cms-repository` describes and validates artifacts and site choices.
`@bernouy/cms-gateway` executes selected capabilities. Runtimes supply storage,
network access, secrets and trusted actors; Control and Delivery mount the HTTP
entry points.

## Artifacts And Site State

| Object | Owner and current implementation |
| --- | --- |
| Contract release | Immutable schemas, capabilities, bindings, mocks and conformance suite definitions; memory/Mongo catalogue. |
| Provider manifest | Immutable provider claims and exact contract references; memory/Mongo catalogue. |
| Installation | Site-owned configuration, exact approved manifest, administrative lifecycle and runtime observations; revisioned memory/Mongo store. |
| Selection | Site-owned exact contract/provider choices, validated together as a bounded dependency graph; revisioned memory/Mongo store. |
| Collection release | Immutable component, composition, view and dashboard bundle; local repository catalogue and site installation/upgrade. |

Contract admission validates and canonicalizes a release. Provider admission
validates a manifest against releases. Site preparation and approval establish
the installation's permitted configuration and manifest digest. Selection
planning validates proposed choices against catalogue and installation revisions.
Runtime observations describe live state; they cannot approve a manifest or
change the site's selection.

These APIs exist in explicit `cms-repository/contracts`, `/providers` and
`/collections` subpaths. Mongo adapters use `/contracts/mongo` and
`/providers/mongo`. The package root exports types only. See the
[repository package guide](../../packages/features/cms-repository/README.md)
for the complete export map.

## Local Releases

`bun run ulvia -- release <resource-directory>` reads the folder's
`definition.json` and stores a canonical immutable release under the user's
Ulvia data directory. Contract folders declare `kind: "contract"`; provider
folders declare `kind: "provider-manifest"`. Release contracts before provider
manifests that reference their exact version and digest. The loopback local
repository lists and serves both types at `/v1/contracts` and `/v1/providers`.
Control can list and import exact contract and manifest releases from this
repository. Importing a provider manifest resolves and preflights its exact
implemented contract releases from the same configured repository before any
catalogue publication. Releasing an artifact does not contact a provider, execute
conformance tests, or approve an installation.
Declared contract fixture assets live in `fixtures/<asset-id>` inside the
authored folder and are validated before the local release is stored.
Control's Mongo contract catalogue does not yet persist fixture assets, so
the current import flow accepts only contracts without them.

The first official resources are `catalog.items`, `forms.submissions`,
`media.assets` and the `ulvia.official` manifest under `packages/official-repository/`.
The `@bernouy/ulvia-official-provider/server` entrypoint serves one authenticated account,
a starter catalogue item, provider-owned form receipts and one SVG asset.
The [CLI guide](../../packages/runtimes/ulvia-cli/README.md) gives the local
release and connection steps.

## Live Invocation

```text
Control or Delivery request
  -> trusted actor supplied by the surface
  -> exact site selection and approved installation
  -> current readiness and host authorization
  -> admitted binding plan, credentials and provider identity alias
  -> bounded transport to the provider
  -> contract validation and response projection
```

The current execution slice supports synchronous JSON queries, synchronous
commands with `none` or `natural` idempotency, and bounded file reads. Keyed
commands, asynchronous execution and binary request bodies are rejected. A
dispatched command whose response cannot be accepted can return an unknown
outcome with a request ID; consumers must reconcile it before retrying.
Keyed commands still require durable idempotency before activation.

When `CMS_GATEWAY_SITE_ID` is configured, `cms-server` constructs Mongo release,
manifest, installation and selection stores, a selected catalogue, network and
secret adapters, image storage and observation refresh. The current host policy
allows public/authenticated access on Delivery as declared by the capability;
Control's generic invocation route requires the configured local administrator.
Dashboard View calls use a separate CMS-owned plan and grant: dashboard access
selects the View, then its active grant restricts the call to declared capabilities
and exact provider routes.

| Surface | Routes relative to its base path |
| --- | --- |
| Control | `POST /api/call/<contract>/<capability>`, `GET /api/media/<contract>/<capability>/<fileId>`, `GET /api/image/<contract>/<capability>/<fileId>/<width>.webp` |
| Delivery | `POST /.cms/call/<contract>/<capability>`, `GET /.cms/media/<contract>/<capability>/<fileId>`, `GET /.cms/image/<contract>/<capability>/<fileId>/<width>.webp` |

Routes are mounted only when their dependencies are configured. Image routes
also require the image service. These reads do not publish or select providers.
Dynamic SEO invokes the gateway directly; see [page indexing](../surfaces/page-indexing.md).
Control's `/admin/settings/providers` page lists connected provider accounts
and, directly below them, provider manifests from configured repositories that
are not connected yet. Each connection opens as a page detail. An administrator
can also import an unlisted provider from its public manifest URL. The download
happens in the browser; the CMS receives
the raw JSON, validates it strictly, and resolves every implemented contract
from configured repositories before admitting the manifest. Optional manifest
links can point to provider account setup, documentation, support and the public
website. The connection flow previews an exact runtime report before approval,
then persists the token through the secret store. `/admin/sources` searches contract
releases as catalogue cards with a trusted local icon, purpose, publisher,
categories and repository publication date. Releases from `ulvia.official` are
marked Official. Versions, digests and provider readiness stay in the source
detail instead of the discovery card. A card connects or upgrades an exact
ready release through a selected provider. Installed-source navigation uses the contract title. Its source detail
separates the latest repository release from the latest release reported ready
by a connected provider; the upgrade action remains disabled until the latter
exists. It also shows the observed provider state and links to active dashboards
that declare the contract. `/admin/health` summarizes these
connections, selections, collection versions and dashboard activation. It
reports configuration and the last provider observation, not a fresh live
probe of every capability.
The selected API origin and token belong to installation state. Manifests list
allowed origins but do not classify providers as local or remote. The runtime
accepts HTTPS endpoints and literal loopback HTTP for development, and applies
the gateway's pinned network policy to the report probe. The runtime report
check is not a live contract conformance run.

## Identity And Media

A CMS user keeps one alias per **provider ID**, shared across sites and
installations of that provider. Existing authority aliases are reused; a new
alias is generated only when none exists. CMS subject IDs remain inside the
CMS. Revoking an installation does not delete the provider-wide identity.

File access and derivative requests resolve and authorize the selected
capability again. Image processing is shared with author files through
Foundation, while their storage and lifecycle remain separate. Gateway images
have a server derivative store and currently return `private, no-store` to
clients. See [image delivery](../images/delivery.md).

## Current Integration Gaps

- Control imports releases, approves a provider connection and selects its
  contracts. The CLI can publish and retrieve exact contract and provider
  coordinates through an authenticated immutable repository; automated provider
  upgrade policy remains open.
- Conformance suite validation exists; a live conformance runner is not wired.
- Mongo contract publication rejects fixture assets until a byte store exists.
- Collection releases can be installed and upgraded from configured repository
  sources. Exact remote `push`/`pull` and reversible yanking are implemented;
  production hosting and multi-publisher authorization remain deployment work.
- Provider image transforms run on demand; there is no durable derivative queue
  or public shared-cache policy.

The code establishing the production boundary is
[createProductionGateway](../../packages/runtimes/cms-server/src/runtime/gateway/createProductionGateway.ts)
and [mountSurfaces](../../packages/runtimes/cms-server/src/runtime/mountSurfaces.ts).
The [transition plan](../../PLAN_ACTION.md) tracks the remaining implementation work.
