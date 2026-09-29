# @bernouy/cms-gateway

The gateway resolves a site's exact contract selection and approved provider
installation before invoking a capability. It checks the selected release,
manifest claim, current installation state, fresh runtime observation, actor
access, trusted invocation origin, host grants, input and output schema, and
compiled binding pin.

`CapabilityGateway` activates synchronous JSON queries and bounded binary
file reads through an injected transport. Delivery exposes provider file reads
at `/.cms/media/<contract>/<capability>/<fileId>`; Control exposes the same
capability behind its authenticated `/api/media` route. Both recheck the
current selection and actor grant before returning bytes. `./node-http` provides a Node network adapter that
resolves and pins one public address, permits canonical HTTP loopback targets,
rejects redirects through the transport, and injects host-resolved credentials
and trusted context headers. Commands, operation handles, binary file responses,
provider-to-gateway calls, and system actors fail closed until their
idempotency and grant protocols are implemented. Derivative jobs, public file
cache policy, and provider file writes are not active. Surfaces must create
actors from verified authentication and supply a host authorization decision;
the gateway never accepts an actor or an endpoint from capability input.
`./handlers` supplies a bounded JSON envelope for separately authenticated
Control and Delivery POST routes. The production runtime injects a site-scoped
gateway when `CMS_GATEWAY_SITE_ID` is set. It persists release, manifest,
installation and selection state in MongoDB, reuses the existing provider
identity aliases in `cms_identity_aliases`, resolves provider token references
through `cms-secrets`, and uses the pinned
Node network adapter. Delivery currently grants public capabilities; Control
grants calls only to the configured local administrator.

`./identity` owns the authority-alias service and resolves one stable user alias
per provider ID. `./mongo` retains the `cms_identity_aliases` collection and its
indexes; `./identity/requestScope` caches resolutions for one request. The
production runtime shares that store between legacy Source paths and capability
calls. Site or installation changes do not revoke provider-wide aliases.
`./media` defines deterministic derivative byte keys from provider file
generations and bounded recipes. `./sharp` applies gateway limits and
normalization over the generic
`@bernouy/image-processing/sharp` adapter; the legacy Source image package
still delegates through this gateway profile. The gateway does
not serve or authorize files yet.

The existing `cms-sources` and `cms-source-images` packages remain active for
legacy Control and Delivery paths. They will be retired as capability-backed
consumers and derivative workers replace their behavior.

## Remaining migration gates

1. Add authorized publication, installation and selection management flows so
   sites can populate the durable catalogues without direct database writes.
   Add separate fixture-asset byte storage for Mongo release publication.
2. Exercise the production network composition against real custom and official
   provider fixtures, harden cross-catalogue snapshot consistency, and replace
   full-catalogue revision scans before large deployments.
3. Add durable idempotency, rate policy, audit, telemetry, and separate host
   entrypoints before activating commands or provider/system calls.
4. Migrate Control, Delivery, editor bindings, indexing, and system source
   calls to capability routes while preserving provider-wide identity aliases
   and their observable behavior.
5. Connect declared provider file capabilities to authorization, generation-aware
   derivative jobs, bounded storage, serving, and garbage collection. Remove
   the legacy image package after those paths and benchmarks pass.
