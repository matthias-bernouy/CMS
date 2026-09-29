# @bernouy/cms-gateway

This package implements provider-neutral capability invocation. It consumes
published repository contracts and site-owned provider selections; it does not
publish releases or choose providers.

- Keep untrusted request parsing, authenticated actor creation, and secret
  resolution in explicit host or adapter boundaries. Never accept a provider's
  identity or permission claims as CMS authority.
- Resolve one exact selected contract release and approved installation before
  invoking a capability. Recheck administrative status and fresh observations
  at call time.
- Execute only binding plans admitted by `@bernouy/cms-repository`; do not
  interpret raw author binding documents in runtime code.
- Scope user aliases by site and installation. Keep CMS subject IDs out of
  provider requests.
- Deny execution paths without complete validation or authorization. In
  particular, keyed commands need durable idempotency before activation.
- Keep derivative identity and recipe logic independent of legacy Source IDs.
  Private media disclosure requires current gateway authorization.
- Runtime adapters select HTTP, persistence, DNS policy, secret storage and
  worker implementations. Keep optional adapters in explicit subpaths.

Use `cms-gateway/...` aliases inside this package and declared
`@bernouy/cms-gateway/...` exports outside it.
