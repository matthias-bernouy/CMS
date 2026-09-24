# @bernouy/cms-providers

Provider claims and the first pure models for connecting a CMS to a provider
hub. Business setup happens on the hub; connecting a CMS must not recreate it.

## Public entry points

| Export | Current responsibility |
| --- | --- |
| `@bernouy/cms-providers` | Immutable manifest parsing, reference validation, admission, and digest |
| `@bernouy/cms-providers/installations` | Installation/report/bootstrap types, strict parsers, consistency validation, and protocol metadata |
| `@bernouy/cms-providers/selections` | `ContractSelection` type only: exact contract version, digest, and installation for a site |

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
  installation. A future planner/store must enforce uniqueness per
  `(siteId, contractId)` and validate the complete dependency graph.

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

See the [connection protocol and executable fixtures](fixtures/protocol-v1/connection/README.md)
for wire shapes, intended sequencing, and remaining transport obligations.

## Deliberately not implemented

No installer state machine, HTTP client or mounted routes, secret-store
integration, persistence adapter, UI, provider execution, gateway grant creation,
selection planner, or automatic upgrade. `enabled` is administrative intent,
not proof of a ready connection. The report's `ready` is a claim, not conformance
evidence. This is a reviewable modeling and validation slice, not a working
provider installation feature.
