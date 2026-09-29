# @bernouy/cms-gateway

The gateway resolves a site's exact contract selection and approved provider
installation before invoking a capability. It checks the selected release,
manifest claim, current installation state, fresh runtime observation, actor
access, trusted invocation origin, host grants, input and output schema, and
compiled binding pin.

`CapabilityGateway` activates synchronous JSON queries, synchronous natural or
non-idempotent commands, and bounded binary file reads through an injected
transport. Keyed commands remain closed until a durable idempotency store exists.
Delivery exposes provider file reads
at `/.cms/media/<contract>/<capability>/<fileId>`; Control exposes the same
capability behind its authenticated `/api/media` route. Both recheck the
current selection and actor grant before returning bytes. Delivery also serves
bounded WebP derivatives at `/.cms/image/<contract>/<capability>/<fileId>/<width>.webp`;
Control uses `/api/image`. Each request reauthorizes the original file before
looking up its byte-generation key in the local derivative store.
`./browser` builds bounded `srcset` candidates for same-origin provider media
URLs and activates resolved `data-cms-src` image bindings. Control and Delivery
expose those helpers in their component bundles for authored Blocs.
`./node-http` provides a Node network adapter that
resolves and pins one public address, permits canonical HTTP loopback targets,
rejects redirects through the transport, and injects host-resolved credentials
and trusted context headers. Asynchronous operations, binary file writes,
provider-to-gateway calls, and system actors fail closed until their
execution and grant protocols are implemented. Derivatives currently run on
bounded demand; durable derivative jobs and public file cache policy are not
active. Surfaces must create
actors from verified authentication and supply a host authorization decision;
the gateway never accepts an actor or an endpoint from capability input.
`./handlers` projects successful JSON outputs directly as the selected contract
declares them, with the request ID in a response header, for separately
authenticated Control and Delivery POST routes. The production runtime injects a site-scoped
gateway when `CMS_GATEWAY_SITE_ID` is set. It persists release, manifest,
installation and selection state in MongoDB, reuses the existing provider
identity aliases in `cms_identity_aliases`, resolves provider token references
through `cms-secrets`, and uses the pinned
Node network adapter. Delivery grants public capabilities and authenticated
capabilities to verified users; Control grants calls only to the configured
local administrator. The Control editor lists callable JSON capabilities from
the site's selected releases through `/api/editor/capabilities`.
Delivery checks automatic capability bindings before rendering a page, so a
protected binding can send anonymous visitors to the configured login page
without contacting the provider.

`./identity` owns the authority-alias service and resolves one stable user alias
per provider ID. `./mongo` retains the `cms_identity_aliases` collection and its
indexes; `./identity/requestScope` caches resolutions for one request. The
production runtime shares that store between legacy Source paths and capability
calls. Site or installation changes do not revoke provider-wide aliases.
`./media` owns deterministic derivative keys, the bounded image service, and
the storage port; `./media/local-fs` is the production derivative store. The
byte fingerprint invalidates a derivative when a provider changes the file.
`./media/sharp` applies gateway limits over the generic
`@bernouy/image-processing/sharp` adapter.

The existing `cms-sources` package remains active for Control legacy paths and
Delivery's internal indexing execution. Delivery no longer mounts public
`/.cms/sources` routes or resolves legacy system Sources internally. The
remaining Source paths will be retired as indexing moves to gateway contracts.

## Remaining migration gates

1. Add authorized publication, installation and selection management flows so
   sites can populate the durable catalogues without direct database writes.
   Add separate fixture-asset byte storage for Mongo release publication.
2. Exercise the production network composition against real custom and official
   provider fixtures, harden cross-catalogue snapshot consistency, and replace
   full-catalogue revision scans before large deployments.
3. Add durable idempotency, rate policy, audit, telemetry, and separate host
   entrypoints before activating keyed commands or provider/system calls.
4. Migrate remaining Control and Delivery source paths, indexing, and system source
   calls to capability routes while preserving provider-wide identity aliases
   and their observable behavior.
5. Replace Source image consumers with provider file URLs, move expensive
   derivative work to durable jobs, and add garbage collection and benchmarks
   before removing the legacy image package.
