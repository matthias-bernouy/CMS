# @bernouy/cms-gateway

This package implements provider-neutral capability invocation. It consumes
published repository contracts and site-owned provider selections; it does not
publish releases or choose providers.

## Layout

- `src/invocation/` owns route resolution, authorization, response validation,
  HTTP handlers, and transport implementations.
- `src/execution/` owns immutable collection-view plans and revisioned grants.
- `src/identity/` owns provider-wide authority aliases, their contracts, and
  memory, Mongo, and request-scoped implementations.
- `src/media/` owns provider file handlers, derivatives, image policy, storage
  adapters, and browser image helpers. Generic image processing remains in Foundation.
- `src/exports/` is the public facade. The package root exposes invocation;
  optional HTTP, identity, and media APIs use their named subpaths.

- Keep untrusted request parsing, authenticated actor creation, and secret
  resolution in explicit host or adapter boundaries. Never accept a provider's
  identity or permission claims as CMS authority.
- Resolve one exact selected contract release and approved installation before
  invoking a capability. Recheck administrative status and fresh observations
  at call time.
- Execute only binding plans admitted by `@bernouy/cms-repository`; do not
  interpret raw author binding documents in runtime code.
- Reuse the CMS authority-alias store for one user alias per provider ID,
  independent of sites and installations. Keep CMS subject IDs out of provider
  requests. Installation revocation must not delete provider-wide aliases.
- Deny execution paths without complete validation or authorization. In
  particular, keyed commands need durable idempotency before activation.
- Keep derivative identity and recipe logic independent of legacy Source IDs.
  Private media disclosure requires current gateway authorization.
- Runtime adapters select HTTP, persistence, DNS policy, secret storage and
  worker implementations. Keep optional adapters in explicit domain subpaths.

Use `cms-gateway/...` aliases inside this package and declared
`@bernouy/cms-gateway/...` exports outside it.
