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
there is no new batch control capability or changed published contract format.

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
