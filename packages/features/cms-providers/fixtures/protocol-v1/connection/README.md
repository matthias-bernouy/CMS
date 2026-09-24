# Provider connection V1

These documents exercise the new public parsers. Their digests and tokens are
illustrative placeholders, not an admitted manifest, a real credential, or
evidence of a running implementation. Structural fixture tests do not replace
semantic validation against a trusted admitted manifest.

## Proposed control-plane protocol

`PROVIDER_CONNECTION_PROTOCOL` defines this V1 metadata. No routes are mounted
and no HTTP requests are sent by this package.

| Provider endpoint | Authentication | Wire shape |
| --- | --- | --- |
| `GET /ulvia/report` | CMS-to-provider Bearer token | `ProviderRuntimeReport` response |
| `PUT /ulvia/connections/{installationId}` | CMS-to-provider Bearer token | `ProviderGatewayRegistrationRequest` body, `ProviderGatewayRegistrationResponse` acknowledgement |
| `DELETE /ulvia/connections/{installationId}` | CMS-to-provider Bearer token | Future idempotent removal of that callback registration only |

Registration and deletion are scoped to an installation, not a remote account.
Disconnecting one CMS must not delete shared business data or another site's
registration. Registration is intended as an idempotent upsert, including key
rotation. The future transport must compare the path and body installation IDs
and verify acknowledgement installation/provider/account identities against
the approved installation; the response parser alone checks shape, not this
request-response correlation. No business-capability routes are defined here.

## Intended orchestration, not yet an installer

1. A future server-side action accepts an API origin and dedicated provider
   token, stores the token, and produces a `ProviderConnectionTarget` with a
   secret reference. Never persist the raw submitted token in an installation.
2. Fetch a report using that token and resolve its exact manifest reference
   through a trusted admission source. Report parsing alone grants nothing.
3. Validate the report against that admitted manifest and selected endpoint.
   During renewal or reconnection, also pass the expected remote `accountId`;
   a change requires deliberate reconnection, not silently relabeling the link.
4. An authorized administrator approves the exact manifest version and digest,
   including its declared requirements. Create and validate the persisted
   installation. The validator is not an approval or authorization action.
5. If gateway access is needed, create separate least-privilege grants and a
   distinct provider-to-CMS credential, then register the callback. The
   bootstrap request deliberately carries a raw gateway token transiently;
   never log, persist, or return this DTO through an administrative read API.
6. Plan the full site's contract graph separately and store exact selections.
   Re-observing a report must not perform an upgrade or expand permissions.

The installation parser represents only an approved record. Draft, probing,
approval-required, and registration-failure workflow states are not implemented.
Its `enabled | disabled | revoked` field records administrative intent. A future
runtime must also account for current observations and valid selections.

## Identity, availability, and multiple sites

- `providerId` identifies the provider; `account.id` is its stable, bounded,
  opaque business-space identifier for the presented credentials. Rotating a
  key must not unexpectedly change this identity. Labels are display-only.
- Two sites can share `account.id`. They still have distinct installation IDs
  and token references, and may have distinct gateway grants.
- A report declares exact contract versions and digests with `ready`,
  `setup-required`, or `unavailable`. Multiple releases of one contract are
  allowed. Missing entries assert no availability; they do not delete pins.
- Every reported release must be in the approved manifest, even if unavailable.
  Build version must match that manifest's build range. A different manifest
  requires a fresh explicit approval; it cannot become authority via a report.
- `ProviderRuntimeObservation.observedAt` is a CMS-owned timestamp, not a field
  trusted from the provider. Observation storage, freshness thresholds, health
  checks, and conformance execution remain outside this slice.

## Transport and persistence obligations

An API endpoint is a canonical origin without a path, credentials, query, or
fragment. Gateway callback URLs may have a path but no credentials, query, or
fragment. Parsers accept HTTPS and literal loopback HTTP for development only.
They do not authorize network access. Future adapters must apply deployment
network policy, bounded response reads, timeouts, and redirect rules that never
forward credentials to an unapproved destination.

Installation `configuration` is non-secret and validated against the manifest's
schema. The parser cannot identify arbitrary secrets hidden in legitimate text
fields; callers must use the dedicated secret store. `${SECRET_KEY}` references
follow the CMS secret-reference syntax but are not resolved by this package.

Manifest `credentialSlots` do not add alternative V1 connection mechanisms.
Provider hub SMTP, payment, and other business credentials stay on the hub.
One dedicated provider token plus a separate optional gateway token is the
current connection model. Persistence, approval authorization, token rotation,
revocation, registration execution, and selection planning need implementation
before this protocol is usable end to end.
