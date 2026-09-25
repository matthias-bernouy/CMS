# Provider manifests and site state

`@bernouy/cms-repository/providers` defines immutable provider claims and the
local domain workflows for connecting a CMS to a provider hub. Business setup happens
on the hub; connecting a CMS must not recreate it. Providers consume the
[contracts domain](../contracts/README.md) through its export facade.

## Public entry points

| Export | Current responsibility |
| --- | --- |
| `@bernouy/cms-repository/providers` | Immutable manifest parsing, reference validation, admission, and digest |
| `@bernouy/cms-repository/providers/catalogue` | Immutable manifest publication, ownership, lookup and yank metadata; memory adapter |
| `@bernouy/cms-repository/providers/compatibility` | Deterministic descriptive manifest comparison and approval requirement |
| `@bernouy/cms-repository/providers/installations` | Parsers, preparation/approval lifecycle, observations, readiness and revisioned memory store |
| `@bernouy/cms-repository/providers/selections` | Strict parsing, full-site explicit graph planning and revisioned memory store |

`parse*` functions validate structure and return independent, deeply frozen
snapshots. `validateProviderInstallation` and `validateProviderRuntimeReport`
add consistency checks against a **trusted admitted manifest** supplied by the
caller. They do not authenticate a publisher, discover a manifest, record an
administrator's approval, or send a request.

## Three different records

- **Installation:** the CMS's approved link to an endpoint and remote business
  account. It contains an exact manifest approval, non-secret configuration, and
  secret references. Its administrative status is not connection health.
- **Runtime report:** the provider's observation of available exact releases
  for the authenticated account. It may report only a subset of approved
  implementations. It cannot add permissions or select releases for the site.
- **Contract selection:** the site's intended exact contract release and
  installation. The planner/store enforces uniqueness per `(siteId, contractId)`
  and validates the complete dependency graph without choosing versions for the site.

One provider may serve several exact releases simultaneously. Several CMS sites
may also connect to the same remote account and thus share its business data;
local installations and credentials remain independent.

## Connection V1

The proposed flow starts with an API origin and a dedicated token. Future
server-side orchestration stores the token in a secret store before creating a
`ProviderConnectionTarget` containing only its reference. Authentication uses
Bearer, not a collection of interchangeable connection protocols.

After approval, a separate provider-to-CMS token may be bootstrapped when
gateway callbacks are needed. Its presence alone grants no access. Manifest
`credentialSlots` remain declarative; this slice does not implement slot
binding or additional connection authentication schemes.

See the [connection protocol and executable fixtures](../../fixtures/providers/protocol-v1/connection/README.md)
for wire shapes, intended sequencing, and remaining transport obligations.

## Local workflows and remaining runtime work

Catalogue publication, manifest comparison, explicit preparation/approval,
modification, disable/enable/revoke, report observation, full-site planning and
memory storage are implemented. See [provider workflows](workflows.md) for their
sequencing, optimistic revisions and deliberate V1 policies.

No HTTP client or mounted routes, secret-store integration, durable persistence
adapter, UI, provider execution, gateway grant creation or automatic upgrade is
implemented. The host must authorize actions and provide coherent dependency
snapshots. `enabled` is administrative intent, not proof of a ready connection;
a report's `ready` is a claim, not conformance evidence. These local workflows
are not yet an end-to-end connection to a live hub. See the
[package overview](../../README.md) for the shared layout and public entry points.
