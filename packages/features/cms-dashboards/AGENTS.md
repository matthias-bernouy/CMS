# @bernouy/cms-dashboards

Feature package for declarative dashboards installed by integrations.

## Boundaries

- Root export exposes dashboard contracts, validation, shape-flattening helpers,
  and in-memory repositories.
- `@bernouy/cms-dashboards/mongo` exposes the Mongo repository for composition
  roots.
- Dashboard domain code may depend on published `@bernouy/cms-sources` exports
  for source contracts and `DataShape`.
- Do not import surfaces, runtimes, or concrete source repositories.

## Rules

- Dashboards are declarative data only. They must not carry executable code,
  HTML, or arbitrary scripts.
- Endpoint references must resolve to endpoints declared on the dashboard's
  source when a source is available for validation.
- Param bindings must target endpoint-declared params. The runtime proxy remains
  the security boundary; dashboard validation is a correctness check, not auth.
