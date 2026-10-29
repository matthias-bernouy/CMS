# Public Content Delivery

Every non-reserved public `GET` or `HEAD` crosses Edge's Gateway through
`ulvia.cms.content/delivery.resolve-path`. The selected Content Provider owns
path resolution and final HTML. Edge receives no Page, Bloc catalogue, text
catalogue, rendering settings or editorial projection.

```text
Browser -> Edge -> Gateway -> Content.resolvePath()
                             -> Content routes and access analysis
                             -> existing Page renderer, texts and assets
                             -> native resource stream -> Edge -> Browser
```

## Request and authority

The bounded input contains `path`, `method`, ordered `query` entries and optional
`accept`, `acceptLanguage`, `ifNoneMatch`, `ifRange` and single-byte `range`
metadata. Cookies, bearer credentials, arbitrary headers and CMS subject IDs
are never authored input. Instance provisioning distinguishes the browser-facing
`cmsUrl` from the Provider callback `gatewayUrl` (defaulting to the public URL
when omitted at creation). The standard CLI sets a unique private Docker alias
for the latter. Official pairing completes before an instance becomes ready.
Edge resolves the actor through Access. A native
resource output opts into signed actor context: actor class and, for a member,
a Provider-scoped alias. The invocation issuer rechecks Access state and the
selected route before signing. Content rejects missing signed context.

`/.cms/*`, `/healthz`, `/readyz` and MCP OAuth discovery remain Edge protocol
routes. Content-owned technical resources use `/_content/*`: styles, Bloc
bundles, browser runtimes, published Page snapshots and installed collection
assets. These paths have no compatibility aliases under `/.cms`.

Content resolves system resources (`robots.txt`, sitemap/chunks,
`manifest.webmanifest`, favicon), installed assets, Page routes and not-found
responses. Published Pages and administrator draft reads use the same existing
rendering pipeline. Static capability analysis, private-site restrictions and
system fallback authorization live with Content. Access metadata is read using
the declared `ulvia.cms.installations/capabilities.describe` requirement; the
response contains no Provider origin or credential. Analysis is repeated for
each request, including when the Page document is unchanged.

## Native resource result

A synchronous query declares:

```json
{ "type": "binary", "resource": true, "maxBytes": 10737418240 }
```

The bytes remain a backpressured stream. The closed `x-ulvia-resource` envelope
carries the browser status and approved resource headers. Representation metadata
includes the media type for 200/206/304, so cache revalidation preserves Edge
security policy. It never carries the
body as JSON or base64. Provider transport remains a successful HTTP response,
so resource redirects do not redirect the internal connection. Missing,
oversized or unsafe metadata rejects and closes the stream. EOF, cancellation
and stream failures terminate the invocation observation once.

Edge owns security headers, CSP, cookies, compression and cache policy. Unknown
cache directives default to `no-store`; authenticated output is always
`private, no-store`. HEAD, redirects and 304 responses have empty wire bodies.
Range responses keep their original representation. Edge may gzip ordinary
text responses and adds the appropriate `Vary` and weak representation ETag.

CSP origins are operator configuration in `CMS_CSP_ALLOWED_ORIGINS`, an optional
JSON object with `connect`, `media`, `script`, `style` and `frame` arrays of exact
HTTP(S) origins. Defaults allow same-origin scripts and same-origin editor
framing. Content cannot change this policy through settings, resource metadata
or a generated CSP meta element. Custom deployments inject the runtime setting;
there is currently no dedicated CLI flag for it.

## Invocation and rendering observations

The HTTP root and Gateway invocations share `traceId`. Each invocation retains
its existing request identifier as `invocationId` and links its parent with
`parentInvocationId`. Signed outbound metadata carries the trace; the Provider
client propagates it on return calls through Edge. Content adds `path.resolve`
and `page.render` child observations. Events record identifiers, phase, outcome,
duration and byte counts, never authored input, tokens or response payloads.
The existing bounded Observability collector remains best-effort. Durable
command audit remains fail-closed and separate.

## Current SSR boundary

This change moves the existing renderer and preserves its existing SEO/indexing
queries. Those queries return through Edge using the opaque delegation ticket.
The official Content implementation permits only non-sensitive query delegation
from `delivery.resolve-path`; a query source cannot execute a command.
General execution of declarative browser queries during SSR remains planned.
The existing Content service can resolve public schemas from its local admitted
catalogue; this lookup grants no invocation authority. Live downstream calls
always use the connection-bound Provider SDK through Edge.


## Invocation and cache costs

Each Mongo catalogue instance retains a bounded LRU of verified immutable
admissions (128 entries / 16 MiB of canonical UTF-16 text). Every lookup still
reads its publication head; yank/deprecation and exact identity checks stay
current. Manifest caches follow the same rule. Resolver hints only prioritize
an exact selection or its known specialization, and never authorize a call.
The Edge keeps at most 32 short-lived transport plans, each limited to 512K
UTF-16 code units. The signing boundary and receiving Provider recheck mutable
authority independently of these plans.

Content's downstream capability calls always use the connection-bound Provider
SDK through Edge, including when both contracts are served by the same Provider.
The SDK rereads the connection credential for each invocation. Dispatch uses the
HTTP listener, so Edge ingress, Gateway invocation and Provider ingress remain
observable. There is no same-process dispatch shortcut for these calls.

Identity and root delegation preparation run concurrently for queries. A failed
preparation closes a partially issued root ticket. Dispatch still obtains a fresh
invocation token; binary results retain their delegation until completion or
cancellation. Commands retain their audit ordering. The route control response
negotiates standard gzip while preserving its complete JSON shape and `no-store`;
the exact 1.0.0 control path retains its declared envelope. The later negotiated
1.1.0 and 1.2.0 preparation capabilities are described below.

Initial mutable metadata reads may be reused within one explicitly scoped
operation; final signing and receiver fences bypass that context. Named secret
resolution retains both metadata-read and resolve permissions without duplicate
metadata lookup. `capabilities.describe` reads selected release metadata without
loading target transport configuration and fences its selection before returning.

With Installations `1.1.0`, Edge combines query identity, optional root delegation
and invocation signing through `gateway.dispatch.prepare`. The control connection
is required; user and Provider actors cannot invoke this command as authority.
Business capabilities still traverse Edge and the authenticated HTTP listener.
Commands preserve identity-before-start-audit ordering. Existing exact `1.0.0`
control connections retain their declared operations until their profile changes;
Edge negotiates the exact ready control version again on restart.


## Shared Edge response cache

Each production Edge owns an ephemeral response cache (`CMS_EDGE_RESPONSE_CACHE`,
`true` by default in production and `false` in development). Cookies, Bearer
credentials, non-anonymous actors, ranges and `If-Range` bypass it. Its identity
contains the canonical path, ordered query pairs, Accept and normalized
Accept-Language. It never stores private/no-store, partial, redirect, 304 or
error responses. Conditional GET and HEAD hits need no Provider invocation.
A HEAD miss does not populate the cache. Cached identity and gzip bytes share
an ETag identity; gzip uses the weak representation validator. Vary is preserved.

Public Pages declare `public, no-cache, s-maxage=15`; browsers receive the
no-cache policy without s-maxage. Freshness starts when a fill begins, not when
its body finishes. Fills older than 15 seconds cannot capture a new request or
replace a newer fill. Explicit stale-while-revalidate/stale-if-error policies
are supported, but ordinary Pages do not opt into them. Dynamic indexing runs
its authorized query on every view and uses `private, no-store` in both caches.

Completed dispatched Content and Installations mutations invalidate before
returning their response, including declared errors. Pre-dispatch refusals do
not invalidate. Unknown outcomes and out-of-band writes can remain stale for
at most 15 seconds after the effective write. A purge advances a generation:
new requests cannot join old fills, and old fills cannot repopulate the cache.
Logs and Access authentication commands are neutral; file mutations affecting
inline SVG invalidate rendered state. The official command inventory is tested.

Content 1.1.0 accepts `resourceMetadata: "cache-v1"`. Edge sends this option only
when the selected input declares it. Native metadata can then carry bounded
`vary` and `cacheTags` lists. Only Accept, Accept-Language and Accept-Encoding
are allowed variation dimensions. Content mutations purge Page and mutable
resource tags; immutable addressed bytes survive these edits. Installation,
selection and unknown official mutations purge globally. Untagged older
responses always follow global invalidation. Metadata cannot supply cookies,
security headers, credential variation or a new authority input.

The cache retains at most 256 entries and 16 MiB of serialized representation
bytes, with a 1 MiB entry bound, 16 concurrent fills and 64 waiters per fill.
Oversized bodies continue streaming without being cached. `Age` and `x-cache`
expose the delivery outcome; debug observations do not generate Provider work
for production cache hits. These caches are process-local: multi-Edge purge
coordination remains outside the supported deployment model.

## Reduced origin work

Capability descriptions remain calls through Edge. One analyzer/cache belongs
to each Provider instance. Keys include the current selection revision read
through ProviderExecutionStateReader. A miss rechecks that revision after the
call and retains the description only when it is unchanged. Failures are
retryable; entry, byte, pending-load and waiter bounds limit retention.

Rendering reuses only revision metadata from the settings and Bloc records it
actually loaded. The ordered settings and route rereads remain fresh. The real
Mongo regression gates seven warm Content reads instead of nine: system twice,
Bloc records once, collection installations once, routes twice and the Page once.
Compression creates Brotli/gzip variants only on their first negotiation.

Unused delegation roots reserve bounded metadata in the authority process;
their first consumed child persists the existing durable quota record. Closing
an unused root requires no Mongo write. Consumed roots still close immediately through control. Edge tracks root
liveness itself and refuses completed/unknown tickets before delegation
inspection. Unused roots close locally; at most 64 cleanup proofs accompany
the next preparation, with retries until acknowledged. Pending and closed
roots share a 256-entry bound; no Provider claim decides liveness. A restart loses unused
reservations and refuses those tickets. Consumed roots retain atomic budgets,
live actor/key/selection checks and the original closure and expiry fences.

Installations 1.2.0 adds control-only `gateway.provider.prepare`. For explicit
machine calls Edge groups authentication, authorization and signing into one
control call. The broker derives the source from the opaque credential. A
single-use host proof binds the source, request ID, installation, release,
capability and audience before ordinary pinned HTTP dispatch. Commands retain
input validation, durable audit and post-dispatch invalidation. Delegated user
calls retain their existing actor inspection path. Older control versions use
their original operations. No Provider-to-Provider business shortcut is added.
