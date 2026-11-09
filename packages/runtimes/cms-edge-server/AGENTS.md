# @bernouy/cms-edge-server

Production composition root for a shared, stateless CMS Edge listener.

## Responsibilities

- Read environment in the runtime. `CMS_HOSTING_PROVIDER_URL` is the trusted
  hosting Provider origin; `CMS_HOSTING_EDGE_SECRET` signs machine routing calls.
  Reject the former single-instance public URL and credential configuration.
- Resolve each request hostname through the exact admitted
  `ulvia/provider.routing` contract before opening a context or resource cache.
  Unknown or inactive domains never select a default tenant.
- Keep one listener in `src/index.ts`. `createTenantEdge` constructs independent
  HTTP route trees without listening. Tenant creation starts no Edge process.
- Forward public resources through selected Content capabilities; never receive
  a ContentRepository, Content projections or a Content rendering engine.

## Authority and isolation

- The Edge routing key grants only machine domain resolution, never CMS user or
  hosting administrator authority. No operator credential or persistent tenant
  signing secret belongs here. Never log credentials or control leases.
- A short-lived control lease belongs to one domain/instance revision and origin.
  Consume it only at the central Provider boundary. Request scoped invocation
  tokens through Installations before calling any selected capability Provider.
- Validate the instance identity and exact supported Installations pin in each
  fetched report. Never accept an arbitrary instance header or a changed origin
  during lease renewal. Failed routing/renewal cannot reuse previous authority.
- Keep Gateways, credentials, route caches, public resource caches, OAuth/MCP,
  cookie policy, CSP and journal sinks inside the tenant context. Host diagnostics
  stay operator-owned. Signed subject resolution remains behind contracts.
- Preserve one canonical CMS origin. Registered aliases redirect there before
  constructing a context. Ignore caller-supplied forwarding headers for routing;
  preserve the captured TCP peer when rebuilding a scoped Request.

## Resources and coherence

- Hard-bound contexts, concurrent loads, context leases and routing requests.
  Coalesce context loads; release idle contexts without interrupting active bodies.
  A response retains its context through completion, cancellation or request abort.
- Route again at every ingress, even for a warm context/cache. Domain/instance
  revisions select contexts; the Provider fences lease use against current state.
- Routing returns a resource revision separate from domain/instance authority.
  Purge a context's public cache and pending fills before handling an ingress
  whose revision changed. Content, collection, selection and file writes advance
  the shared clock before releasing their durable write permit. Busy/maintenance
  reads receive unique revisions, preventing cache reuse. A request overlapping a
  write may finish with the earlier representation; routing after an acknowledged
  write must invalidate every warmed Edge. Keep ordinary cache HITs when quiet.
- Connect each context's bounded diagnostics queue only to its own selected
  Observability contract and drain it before disposal. Keep no persistent journal.
- New cross-process operations require admitted contracts. Never mount the Provider
  surface here or restore a private instance protocol.
