# Repository And Gateway Flows

`@bernouy/cms-repository` describes and validates artifacts and site choices.
`@bernouy/cms-gateway` executes selected capabilities. Runtimes supply storage,
network access, secrets and trusted actors; the Edge mounts the site HTTP
entry points.

## Artifacts And Site State

| Object | Owner and current implementation |
| --- | --- |
| Contract release | Immutable schemas, capabilities, bindings and mocks; memory/Mongo catalogue. |
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
The administration Pages can list and import exact contract and manifest releases from this
repository. Importing a provider manifest resolves and preflights its exact
implemented contract releases from the same configured repository before any
catalogue publication. Releasing an artifact does not contact a provider or
approve an installation.
Declared contract fixture assets live in `fixtures/<asset-id>` inside the
authored folder and are validated before the local release is stored.
The Mongo contract catalogue does not yet persist fixture assets, so
the current import flow accepts only contracts without them.

Each V1 repository catalogue response contains at most 256 releases and may
return an opaque `nextCursor`. Repository clients consume all pages with global
duplicate, loop and memory bounds. Exact-coordinate reads are independent of
the metadata-only catalogue index.

The official repository publishes the `ulvia.cms.*` CMS contracts, the
`ulvia.provider.connections` return-channel contract, the provider-only
`ulvia.provider.cms-instances` contract reserved for future instance providers,
and the `ulvia.official` provider manifest. The local runtime implements the CMS
contracts and `ulvia.provider.connections`. The former `catalog.items`,
`forms.submissions` and `media.assets` demonstration contracts are not official
resources.
The [CLI guide](../../packages/runtimes/ulvia-cli/README.md) gives the local
release and connection steps.

## Live Invocation

```text
Browser request
  -> Edge resolves one opaque credential through Access when actor lookup is needed
  -> trusted request actor (anonymous, authenticated or administrator)
  -> exact site selection and approved installation
  -> current readiness and host authorization
  -> admitted binding plan, credentials and provider identity alias
  -> bounded transport to the provider
  -> contract validation and response projection
```

Provider-to-provider calls authenticate the source installation with its Bearer
credential. The host then checks that the source manifest declares the exact
contract capability and compatible target version, that the instance selection
restrictions permit it, and that its quota allows the call. Approving the source
manifest accepts its global `requires` and the requirements of implementations
selected on that instance; no additional per-source
permission list must be maintained. Cycles and paths longer
than eight contracts are rejected when the site selection graph is validated;
the signed source identifier is forwarded as opaque machine provenance.

For a live capability call, the gateway derives a short-lived HMAC Bearer from
the installation's provider credential. Its closed claims contain only the
request ID, provider-owned opaque instance audience, exact contract version and
capability, timestamps, an opaque destination connection identifier, and either
a provider-scoped subject, a source Provider identifier, or an authorized system
service. These identity modes cannot be combined. Binary resources additionally
carry verified actor kind; CMS-global subject identifiers are never forwarded.
The provider checks the signature, audience, capability and expiry and receives
its local site/provider scope from runtime configuration. Installed native calls
use the signed invocation as a short-lived capability lease: grants, selections
and installation status are checked when issuing it. Their subsequent change
prevents new issuance but does not recall a previously issued lease. The native
host still checks current instance and connection-key activity on every call.
Leases have a nominal 30-second maximum lifetime, with the token verifier's
existing five-second clock tolerance. They are checked again after asynchronous
runtime preparation. The private control channel retains fresh site authority
checks. The durable credential itself
is sent only to the authenticated `/ulvia/report` control endpoint.

The generic execution path supports structured synchronous calls,
operation-handle responses, keyed/natural/non-idempotent commands and streamed
binary requests or responses according to the admitted binding. Keyed commands
require an idempotency key; the browser mutation runtime generates one stable
attempt key for an unchanged submission. A dispatched command whose response
cannot be accepted returns an unknown outcome with a request ID; consumers must
reconcile it before retrying.

The provider-neutral discovery catalogue exposed to ordinary collection
authoring is deliberately narrower: it lists synchronous, structured,
non-keyed public/authenticated capabilities. Advanced or administrator-only
operations need an explicit product workflow rather than accidental catalogue
exposure.

Ulvia Provider resolves every opaque instance Bearer against its durable
registry before opening that instance's stores and gateway. The Edge receives
only its Provider URL and instance token; it does not receive the Provider
operator secret or select an instance through a caller-supplied site header.
The current host policy allows public, authenticated or administrator access as
declared by each capability. Before rendering, the Edge statically verifies
the requirements of collection-owned and site-owned Pages, including transitive
Bloc requirements, and derives the Page access level from those capabilities.
This analysis controls rendering and caching; it is not a live invocation grant.
Browser calls are authorized from the trusted actor and the selected
capability's declared access, without a `Referer` or Page execution pin.

The Ulvia Provider transport is contract-neutral: `@bernouy/ulvia-provider`
derives its HTTP routes from admitted contract bindings. The same package
contains thin official capability adapters that coordinate injected feature
ports; it does not select stores or persistence adapters. Browser bindings use
logical query and mutation routes; canonical binding calls also remain available.
The stateless Edge resolves the selected installation and invokes its admitted
binding through the local Gateway.

Browser credentials follow a separate, narrow path. Edge extracts either one
Bearer credential or the fixed `cms-session` cookie and asks the selected
`ulvia.cms.access:resolve-actor` capability to resolve it. The Provider
receives a typed opaque credential only for that operation, resolves it through
Access and returns actor state. Edge then supplies that trusted actor to
ordinary capability calls. Arbitrary browser Cookie and Authorization headers
are never forwarded as general Provider authority. The shared bounded JSON
budget applies at both HTTP boundaries.

| Application | Routes relative to its base path |
| --- | --- |
| Edge query | `/.cms/query/<contractId>/<capabilityId>` for logical query requests using GET or QUERY |
| Edge mutation | `/.cms/mutation/<contractId>/<capabilityId>` for logical POST submissions |
| Edge | `/.cms/call/<contractId><binding.path>` for every admitted HTTP method, with capability-derived access |

Routes are mounted only when their dependencies are configured. Binary reads,
including Files representations, use the same generic route.
Logical GET queries accept empty input; QUERY carries a structured input body.
Logical routes reject URL parameters. A public capability can be called
anonymously through its canonical binding without a Page or Referer grant;
the Provider still applies its own business rules.
Dynamic SEO invokes the gateway directly; see [page indexing](../surfaces/page-indexing.md).
The `/admin/providers` Page lists provider installations and their exact
contract selections. The `ulvia.cms.installations` contract is the shared
administrative boundary for provider and collection installations. Its
capabilities provide bounded list/detail, selection replacement, collection
lifecycle and provider-status mutations. The control Provider's own
`ulvia.cms.installations` selection is pinned; ordinary contracts remain
replaceable. Manifest
import and provider connection approval are application workflows owned by
`cms-repository`: the host obtains an exact runtime report, validates it against
the admitted manifest, persists the credential through the injected secret
store and records an observation. These workflows are not a second protocol and
do not give collection JavaScript direct access to credentials.

`/admin/collections` exposes repository discovery, installation, configuration
and reviewed release upgrades through `ulvia.cms.installations`; collection theme editing uses
the `theme.*` capabilities of `ulvia.cms.content`, and language/text editing
uses its `localization.*` capabilities. `/admin/settings` uses the same content
contract for non-secret site configuration; `/admin/access` only covers members,
authentication and administrator grants.
Provider health remains the last validated runtime
observation shown by these Pages, not an implicit live probe of every
capability. Collection requests use those same generic query, mutation or
canonical binding transports.
The selected API origin and token belong to installation state. Manifests list
allowed origins but do not classify providers as local or remote. The runtime
accepts HTTPS endpoints and literal loopback HTTP for development, and applies
the gateway's pinned network policy to the report probe.

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

- Publisher-key namespaces and an MCP repository binding are planned on this
  branch, not mounted services. Current publication uses the configured shared
  mutation signing secret.
- Cookie-authenticated browser commands do not yet have one centralized
  Origin/Fetch Metadata policy. Cookie flags and capability authorization do
  not replace that policy; see [open platform work](../TODO.md).
- Administration Pages manage installed releases, approved provider connections and exact
  selections. The CLI can publish and retrieve exact contract and provider
  coordinates through an authenticated immutable repository; automated provider
  upgrade policy remains open.
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
[createEdgeGateway](../../packages/runtimes/cms-edge-server/src/runtime/gateway/createEdgeGateway.ts),
[public resource forwarding](../../packages/runtimes/cms-edge-server/src/runtime/publicResource.ts)
and [mountProductionEdge](../../packages/runtimes/cms-edge-server/src/runtime/mountEdge.ts).
The [repository audit](../AUDIT.md) and [open platform work](../TODO.md)
track the remaining implementation and activation gates.

See [Connecting Providers from the CMS](connections.md) for approval, return credentials and SDK usage.

See [Provider delegation](delegation.md) for actor-bound calls, static selectors,
reviewed wildcard expansion and explicit SDK authority.
