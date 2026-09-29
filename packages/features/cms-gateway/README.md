# @bernouy/cms-gateway

The gateway resolves a site's exact contract selection and approved provider
installation before invoking a capability. It checks the selected release,
manifest claim, current installation state, fresh runtime observation, actor
access, trusted invocation origin, host grants, input and output schema, and
compiled binding pin.

`CapabilityGateway` currently activates synchronous JSON **queries** through
an injected transport. `./node-http` provides a Node network adapter that
resolves and pins one public address, permits canonical HTTP loopback targets,
rejects redirects through the transport, and injects host-resolved credentials
and trusted context headers. Commands, operation handles, binary file responses,
provider-to-gateway calls, and system actors fail closed until their
idempotency, file, and grant protocols are implemented. Surfaces must create
actors from verified authentication and supply a host authorization decision;
the gateway never accepts an actor or an endpoint from capability input.
`./handlers` supplies a bounded JSON envelope for separately authenticated
Control and Delivery POST routes. Both surfaces mount it only when a host injects
a site-scoped gateway; the production runtime has no provider catalogue wiring
yet.

`./identity` provides site-and-installation scoped user aliases. `./mongo`
provides the durable adapter with unique indexes and scoped revocation; its
`init()` method must run before serving requests. Disconnect workflows must
coordinate revocation with in-flight invocations. `./media` defines
deterministic derivative byte keys from provider file generations and bounded
recipes. `./sharp` applies gateway limits and normalization over the generic
`@bernouy/image-processing/sharp` adapter; the legacy Source image package
still delegates through this gateway profile. The gateway does
not serve or authorize files yet.

The existing `cms-sources`, `cms-source-images`, and `cms-identities` packages
remain active for legacy Control and Delivery paths. They will be retired only
as capability-backed consumers and derivative workers replace their behavior.

## Remaining migration gates

1. Wire `CatalogueGatewayRouteResolver` to production catalogues and site
   selections, with one coherent dependency revision covering installations,
   observations, manifests, releases, and yank changes.
2. Wire the Node network adapter to the production secret store and exercise
   it against a real custom and official provider fixture.
3. Add durable idempotency, rate policy, audit, telemetry, and separate host
   entrypoints before activating commands or provider/system calls.
4. Migrate Control, Delivery, editor bindings, indexing, system source calls,
   and legacy identity lookups to capability and installation scopes while
   preserving their observable behavior.
5. Connect declared provider file capabilities to authorization, generation-aware
   derivative jobs, bounded storage, serving, and garbage collection. Remove
   the legacy image package after those paths and benchmarks pass.
