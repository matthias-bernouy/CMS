# Repository And Gateway Flows

`@bernouy/cms-repository` describes and validates artifacts and site choices.
`@bernouy/cms-gateway` executes selected capabilities. Runtimes supply storage,
network access, secrets and trusted actors; Control and Delivery mount the HTTP
entry points.

## Artifacts And Site State

| Object | Owner and current implementation |
| --- | --- |
| Contract release | Immutable schemas, capabilities, bindings and mocks; memory/Mongo catalogue. |
| Conformance suite | Independently versioned scenarios pinned to one exact contract digest; admission and a transport-neutral live runner exist. |
| Conformance evidence | Immutable output-free result pinned to one suite, contract, provider manifest, build and runner; authenticated publication and exact public reads exist. |
| Provider manifest | Immutable provider claims and exact contract references; memory/Mongo catalogue. |
| Installation | Site-owned configuration, exact approved manifest, administrative lifecycle and runtime observations; revisioned memory/Mongo store. |
| Selection | Site-owned exact contract/provider choices, validated together as a bounded dependency graph; revisioned memory/Mongo store. |
| Collection release | Immutable Bloc, Page, theme, text and asset bundle; local repository catalogue and site installation/upgrade. |

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

Each V1 repository catalogue response contains at most 256 releases and may
return an opaque `nextCursor`. Repository clients consume all pages with global
duplicate, loop and memory bounds. Exact-coordinate reads are independent of
the metadata-only catalogue index.

The official repository publishes the `ulvia.cms.*` Core contracts, the
provider-only `ulvia.provider.cms-instances` contract reserved for future
instance providers, and the `ulvia.official` CMS Core manifest. The local
runtime implements only the Core contracts. The former `catalog.items`,
`forms.submissions` and `media.assets` demonstration contracts are not official
resources.
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

Provider-origin calls authenticate the source installation with its Bearer
credential. The host then checks that the source manifest declares the exact
contract capability and compatible target version, that an exact source/target
grant is enabled, and that its quota allows the call. Cycles and paths longer
than eight contracts are rejected when the site selection graph is validated;
live calls forward the verified source installation identity and the request ID
used for correlation.

The current execution slice supports synchronous JSON queries, synchronous
commands with `none` or `natural` idempotency, and bounded file reads. Keyed
commands, asynchronous execution and binary request bodies are rejected. A
dispatched command whose response cannot be accepted can return an unknown
outcome with a request ID; consumers must reconcile it before retrying.
Keyed commands still require durable idempotency before activation.

When `CMS_GATEWAY_SITE_ID` is configured, `cms-server` constructs Mongo release,
manifest, installation and selection stores, a selected catalogue, network and
secret adapters and observation refresh. The current host policy
allows public/authenticated access on Delivery as declared by the capability;
Control's generic invocation route requires the configured local administrator.
Page execution plans restrict collection-owned and site-owned Control Pages to
the capabilities required by their exact document and transitive Blocs. Control
activates the revisioned plan from the same-origin referring Page before each
call and sends only its immutable execution pin to the gateway.

The local CMS Core transport is contract-neutral: `@bernouy/cms-core` derives
its HTTP routes from admitted contract bindings. The same package contains thin
official capability adapters that coordinate injected feature ports; it does
not select stores or persistence adapters. Control and Delivery still use
their normal `/.cms/call` gateway transport; there is no direct Core shortcut or
internal relay hop. The shared bounded JSON budget applies at the gateway and
Core surface.

| Surface | Routes relative to its base path |
| --- | --- |
| Control | `/.cms/call/<contractId><binding.path>` for every admitted HTTP method |
| Delivery | Same binding-derived `/.cms/call/*` transport, with Delivery access policy |

Routes are mounted only when their dependencies are configured. Binary reads,
including Files representations, use the same generic route.
Dynamic SEO invokes the gateway directly; see [page indexing](../surfaces/page-indexing.md).
Control's `/admin/providers` Page lists provider installations and their exact
contract selections. The `ulvia.cms.providers` capabilities provide bounded
list/detail, selection replacement and lifecycle-status mutations. Manifest
import and provider connection approval are application workflows owned by
`cms-repository`: the host obtains an exact runtime report, validates it against
the admitted manifest, persists the credential through the injected secret
store and records an observation. These workflows are not a second protocol and
do not give collection JavaScript direct access to credentials.

`/admin/collections` exposes repository discovery, installation, configuration
and migration through `ulvia.cms.collections`; collection theme editing uses
`ulvia.cms.theme` and language/text editing uses `ulvia.cms.localization`.
`/admin/settings` and `/admin/access` cover site and administrator settings.
Provider health remains the last validated runtime
observation shown by these Pages, not an implicit live probe of every
capability. Every collection request uses the common
`/.cms/call/<contractId>{binding.path}` transport and its Page execution pin.
The selected API origin and token belong to installation state. Manifests list
allowed origins but do not classify providers as local or remote. The runtime
accepts HTTPS endpoints and literal loopback HTTP for development, and applies
the gateway's pinned network policy to the report probe. The runtime report
check is not a live contract conformance run. Live conformance is a separate
disposable-environment flow exposed by `@bernouy/cms-gateway/conformance`; a
runtime injects provider provisioning and invocation. Evidence can then be
pushed and pulled through the signed repository client without publishing
provider outputs.

## Identity And Files

A CMS user keeps one alias per **provider ID**, shared across sites and
installations of that provider. Existing authority aliases are reused; a new
alias is generated only when none exists. CMS subject IDs remain inside the
CMS. Revoking an installation does not delete the provider-wide identity.

File access and representation requests resolve and authorize the selected
`ulvia.cms.files` capability again. The selected Files provider owns namespaces,
credentials, storage, visibility, signatures, cache policy and derivatives.
The gateway only applies the admitted binding, grants and generic binary
transport rules. See [files and responsive images](../images/README.md).

## Current Integration Gaps

- Control manages installed releases, approved provider connections and exact
  selections. The CLI can publish and retrieve exact contract and provider
  coordinates through an authenticated immutable repository; automated provider
  upgrade policy remains open.
- Conformance suite validation and transport-neutral live execution exist.
  Immutable evidence can be published remotely after the repository rechecks
  the exact contract, dependencies, provider manifest and build range. A
  production disposable-environment adapter, approval policy and
  operator-visible evidence history are not wired yet; suite artifacts are
  embedded in evidence rather than catalogued separately.
- Mongo contract publication rejects fixture assets until a byte store exists.
- Collection releases can be installed and upgraded from configured repository
  sources. Exact remote `push`/`pull` and reversible yanking are implemented;
  `@bernouy/official-repository-server` provides single-replica production hosting
  with durable staged uploads and replay claims. Horizontal storage and
  multi-publisher authorization remain separate work.
- The official Files provider schedules reconstructible image representations in
  process; a durable derivative worker remains future work. Public immutable
  file responses already expose a shared-cache policy.

The code establishing the production boundary is
[createProductionGateway](../../packages/runtimes/cms-server/src/runtime/gateway/createProductionGateway.ts)
and [mountSurfaces](../../packages/runtimes/cms-server/src/runtime/mountSurfaces.ts).
The [repository audit](../AUDIT.md) and [deferred platform work](../TODO.md)
track the remaining implementation and activation gates.
